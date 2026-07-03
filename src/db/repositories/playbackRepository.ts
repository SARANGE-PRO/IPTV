import { db } from '@/db/database';
import type { MediaType, PlaybackEntry } from '@/types/models';

/**
 * Historique de lecture & reprise. Le throttling des ecritures pendant la
 * lecture appartient au playbackStore (etape 6) — ici, persistance brute.
 */

export async function upsertProgress(entry: PlaybackEntry): Promise<void> {
  await db.playback_history.put(entry);
}

export function getProgress(type: MediaType, itemId: string): Promise<PlaybackEntry | undefined> {
  return db.playback_history.get([type, itemId]);
}

/** Contenus repris (vod + episodes), non termines, du plus recent au plus ancien. */
export function getContinueWatching(limit: number): Promise<PlaybackEntry[]> {
  return db.playback_history
    .orderBy('updatedAt')
    .reverse()
    .filter((e) => e.finished === 0 && (e.type === 'vod' || e.type === 'episode'))
    .limit(limit)
    .toArray();
}

/** Chaines live recemment regardees, de la plus recente a la plus ancienne. */
export function getRecentLiveChannels(limit: number): Promise<PlaybackEntry[]> {
  return db.playback_history
    .orderBy('updatedAt')
    .reverse()
    .filter((e) => e.type === 'live')
    .limit(limit)
    .toArray();
}

/** Progression des episodes d'une serie, indexee par id d'episode. */
export async function getSeriesEpisodeProgress(
  seriesId: string,
): Promise<Map<string, PlaybackEntry>> {
  const rows = await db.playback_history
    .where('type')
    .equals('episode')
    .filter((e) => e.seriesId === seriesId)
    .toArray();
  const map = new Map<string, PlaybackEntry>();
  for (const row of rows) map.set(row.itemId, row);
  return map;
}

export async function markFinished(type: MediaType, itemId: string): Promise<void> {
  await db.playback_history.update([type, itemId], { finished: 1, updatedAt: Date.now() });
}

export async function removeProgress(type: MediaType, itemId: string): Promise<void> {
  await db.playback_history.delete([type, itemId]);
}

export async function clearHistory(): Promise<void> {
  await db.playback_history.clear();
}
