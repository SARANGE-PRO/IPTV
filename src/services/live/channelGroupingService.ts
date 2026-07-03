import { canonicalChannelKey, cleanChannelDisplay, detectQuality } from '@/services/live/channelNormalizer';
import type { ChannelGroup, ChannelVersion } from '@/types/liveGrouping';
import type { LiveChannel } from '@/types/models';
import { compareLiveChannels } from '@/utils/channelPriority';

/**
 * Regroupe les chaines Live par nom canonique (dedoublonnage logique) : une
 * entree "TF1" avec toutes ses variantes de qualite en versions. Aucune
 * variante n'est supprimee. Opere sur un POOL BORNE (jamais les 55k).
 */

export interface GroupingSignals {
  favoriteIds?: Set<string>;
  recentIds?: Set<string>;
}

const FAVORITE_BOOST = 1000;
const RECENT_BOOST = 500;

function versionScore(channel: LiveChannel, base: number, signals: GroupingSignals): number {
  let score = base;
  if (signals.favoriteIds?.has(channel.id) === true) score += FAVORITE_BOOST;
  if (signals.recentIds?.has(channel.id) === true) score += RECENT_BOOST;
  return score;
}

/** Groupe une liste bornee de chaines. L'ordre des groupes suit le tri Live. */
export function groupChannels(channels: LiveChannel[], signals: GroupingSignals = {}): ChannelGroup[] {
  const byKey = new Map<string, { name: string; versions: ChannelVersion[] }>();

  for (const channel of channels) {
    const key = canonicalChannelKey(channel.name);
    const detected = detectQuality(channel.name);
    const version: ChannelVersion = {
      channel,
      quality: detected.quality,
      label: detected.label,
      score: versionScore(channel, detected.score, signals),
    };
    const bucket = byKey.get(key);
    if (bucket === undefined) {
      byKey.set(key, { name: cleanChannelDisplay(channel.name) || channel.name, versions: [version] });
    } else {
      bucket.versions.push(version);
    }
  }

  const groups: ChannelGroup[] = [];
  for (const [key, { name, versions }] of byKey) {
    versions.sort((a, b) => b.score - a.score || compareLiveChannels(a.channel, b.channel));
    const best = versions[0]!.channel;
    groups.push({ key, name, isFrench: best.isFrench, best, versions });
  }

  groups.sort((a, b) => compareLiveChannels(a.best, b.best));
  return groups;
}

/** Versions d'une chaine donnee dans un pool (pour le selecteur du player). */
export function findChannelVersions(pool: LiveChannel[], channel: LiveChannel): ChannelVersion[] {
  const key = canonicalChannelKey(channel.name);
  const versions = pool
    .filter((candidate) => canonicalChannelKey(candidate.name) === key)
    .map((candidate) => {
      const detected = detectQuality(candidate.name);
      return { channel: candidate, quality: detected.quality, label: detected.label, score: detected.score };
    });
  versions.sort((a, b) => b.score - a.score || compareLiveChannels(a.channel, b.channel));
  return versions;
}
