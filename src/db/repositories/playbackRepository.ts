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
    .filter((e) => e.finished === 0 && (e.type === 'vod' || e.type === 'episode') && !isDismissed(e))
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

/** Historique recent borne, utilise pour les classements personnels locaux. */
export function getRecentHistory(limit: number): Promise<PlaybackEntry[]> {
  return db.playback_history.orderBy('updatedAt').reverse().limit(limit).toArray();
}

/** Series ayant au moins un episode commence, ordre de derniere lecture. */
export async function getInProgressSeriesIds(limit: number): Promise<string[]> {
  const rows = await db.playback_history
    .orderBy('updatedAt')
    .reverse()
    .filter((entry) => entry.type === 'episode' && entry.finished === 0 && entry.seriesId !== null)
    .limit(limit * 4)
    .toArray();
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (row.seriesId === null || seen.has(row.seriesId)) continue;
    seen.add(row.seriesId);
    ids.push(row.seriesId);
    if (ids.length >= limit) break;
  }
  return ids;
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

/** Marque des episodes/films comme VUS (entree terminee) en une transaction. */
export async function markWatched(entries: PlaybackEntry[]): Promise<void> {
  await db.playback_history.bulkPut(entries);
}

/** Marque comme NON VUS : supprime la progression. */
export async function markUnwatched(type: MediaType, itemIds: string[]): Promise<void> {
  await db.playback_history.bulkDelete(itemIds.map((id) => [type, id] as [MediaType, string]));
}

/** Masque une entree de « Continuer a regarder » (progression conservee). */
export async function dismissEntry(type: MediaType, itemId: string): Promise<void> {
  await db.playback_history.update([type, itemId], { dismissedAt: Date.now() });
}

/** Masque tous les episodes d'une serie de « Continuer a regarder ». */
export async function dismissSeries(seriesId: string): Promise<void> {
  const now = Date.now();
  await db.playback_history
    .where('type')
    .equals('episode')
    .filter((e) => e.seriesId === seriesId)
    .modify({ dismissedAt: now });
}

/** Vrai si l'entree a ete retiree de « Continuer » APRES sa derniere lecture. */
export function isDismissed(entry: PlaybackEntry): boolean {
  return entry.dismissedAt != null && entry.dismissedAt >= entry.updatedAt;
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
