import * as catalogRepository from '@/db/repositories/catalogRepository';
import { groupChannels } from '@/services/live/channelGroupingService';
import { isSeparatorOrEvent } from '@/services/live/channelNormalizer';

/**
 * Listing anonymise des chaines FR disponibles (apres groupement des doublons).
 * NE contient JAMAIS de lien de flux ni d'identifiant — uniquement des metriques
 * editoriales. Pour l'export diagnostic dans les Reglages.
 */

export interface FrenchChannelEntry {
  name: string;
  versionsCount: number;
  bestQuality: string;
  qualities: string[];
  /** Nombre de categories fournisseur distinctes contenant cette chaine. */
  providerCategories: number;
  hasLogo: boolean;
}

export interface FrenchChannelListing {
  totalFrenchStreams: number;
  logicalChannels: number;
  multiVersionChannels: number;
  channelsWithoutLogo: number;
  channels: FrenchChannelEntry[];
}

/** Construit le listing depuis un pool FR borne (jamais tout le catalogue). */
export async function buildFrenchChannelListing(cap = 4000): Promise<FrenchChannelListing> {
  const pool = await catalogRepository.getLiveChannelsPage({ kind: 'french' }, 0, cap);
  const groups = groupChannels(pool.filter((c) => !isSeparatorOrEvent(c.name)));

  const channels: FrenchChannelEntry[] = groups.map((group) => {
    const categories = new Set(group.versions.map((v) => v.channel.categoryId));
    const qualities = [...new Set(group.versions.map((v) => v.label))];
    return {
      name: group.name,
      versionsCount: group.versions.length,
      bestQuality: group.versions[0]?.label ?? 'Standard',
      qualities,
      providerCategories: categories.size,
      hasLogo: group.versions.some((v) => v.channel.logoUrl !== null && v.channel.logoUrl !== ''),
    };
  });

  return {
    totalFrenchStreams: pool.length,
    logicalChannels: groups.length,
    multiVersionChannels: channels.filter((c) => c.versionsCount > 1).length,
    channelsWithoutLogo: channels.filter((c) => !c.hasLogo).length,
    channels,
  };
}
