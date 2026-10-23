import * as playbackRepository from '@/db/repositories/playbackRepository';
import { getLineupEntries } from '@/services/live/frenchLineupService';
import type { PlaybackEntry } from '@/types/models';

/**
 * Chaines recemment regardees, UNE par chaine : une bascule HD -> FHD (ou un
 * changement de version) enregistre un autre flux de la meme chaine, qui ne
 * doit pas apparaitre deux fois. La version la plus recente l'emporte.
 */
export async function getRecentChannels(limit: number): Promise<PlaybackEntry[]> {
  const raw = await playbackRepository.getRecentLiveChannels(limit * 3);
  const entries = await getLineupEntries(raw.map((e) => e.itemId)).catch(() => raw.map(() => undefined));
  const seen = new Set<string>();
  const out: PlaybackEntry[] = [];
  raw.forEach((entry, i) => {
    const key = entries[i]?.groupKey ?? `id:${entry.itemId}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(entry);
  });
  return out.slice(0, limit);
}
