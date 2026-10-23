import * as catalogRepository from '@/db/repositories/catalogRepository';
import { ensureFrenchLineup, getLineupGroups } from '@/services/live/frenchLineupService';
import { sectionLabel } from '@/utils/liveSections';

/**
 * Listing anonymise des chaines FR disponibles, tel que la page Live les range
 * (grille FR : sections, numeros TNT, versions regroupees). NE contient JAMAIS
 * de lien de flux ni d'identifiant — uniquement des metriques editoriales.
 * Pour l'export diagnostic dans les Reglages.
 */

export interface FrenchChannelEntry {
  name: string;
  section: string;
  lcn: number | null;
  country: string | null;
  versionsCount: number;
  bestQuality: string;
  qualities: string[];
  /** Nombre de categories fournisseur distinctes contenant cette chaine. */
  providerCategories: number;
  hasLogo: boolean;
}

export interface FrenchChannelListing {
  totalFrenchStreams: number;
  /** Flux FR ranges dans la grille (hors separateurs, evenements, adultes). */
  lineupStreams: number;
  logicalChannels: number;
  multiVersionChannels: number;
  channelsWithoutLogo: number;
  /** Chaines par section, dans l'ordre d'affichage. */
  sections: { section: string; channels: number }[];
  channels: FrenchChannelEntry[];
}

export async function buildFrenchChannelListing(): Promise<FrenchChannelListing> {
  await ensureFrenchLineup();
  const [groups, totalFrenchStreams] = await Promise.all([
    getLineupGroups(),
    catalogRepository.countLiveChannels({ kind: 'french' }),
  ]);

  const channels: FrenchChannelEntry[] = groups.map((group) => ({
    name: group.name,
    section: sectionLabel(group.section),
    lcn: group.lcn,
    country: group.country,
    versionsCount: group.versions.length,
    bestQuality: group.versions[0]?.qualityLabel ?? 'Standard',
    qualities: [...new Set(group.versions.map((v) => v.qualityLabel))],
    providerCategories: new Set(group.versions.map((v) => v.categoryId)).size,
    hasLogo: group.versions.some((v) => v.logoUrl !== null && v.logoUrl !== ''),
  }));

  const sections: { section: string; channels: number }[] = [];
  for (const entry of channels) {
    const last = sections.at(-1);
    if (last?.section === entry.section) last.channels += 1;
    else sections.push({ section: entry.section, channels: 1 });
  }

  return {
    totalFrenchStreams,
    lineupStreams: groups.reduce((n, g) => n + g.versions.length, 0),
    logicalChannels: groups.length,
    multiVersionChannels: channels.filter((c) => c.versionsCount > 1).length,
    channelsWithoutLogo: channels.filter((c) => !c.hasLogo).length,
    sections,
    channels,
  };
}
