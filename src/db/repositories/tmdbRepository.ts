import { db } from '@/db/database';
import type { TmdbCacheEntry } from '@/types/models';

/** Cache TMDB local. La derivation des cles appartient a tmdbMatcher (etape 9). */

export function getTmdbEntry(key: string): Promise<TmdbCacheEntry | undefined> {
  return db.tmdb_cache.get(key);
}

/** Lecture en lot (enrichissement progressif d'une grille), indexee par cle. */
export async function getTmdbEntries(keys: string[]): Promise<Map<string, TmdbCacheEntry>> {
  const rows = await db.tmdb_cache.bulkGet(keys);
  const map = new Map<string, TmdbCacheEntry>();
  for (const row of rows) {
    if (row !== undefined) map.set(row.key, row);
  }
  return map;
}

export async function putTmdbEntry(entry: TmdbCacheEntry): Promise<void> {
  await db.tmdb_cache.put(entry);
}

/** Purge les entrees plus anciennes que cutoff (ms). Renvoie le nombre supprime. */
export function purgeTmdbOlderThan(cutoff: number): Promise<number> {
  return db.tmdb_cache.where('fetchedAt').below(cutoff).delete();
}

export async function clearTmdbCache(): Promise<void> {
  await db.tmdb_cache.clear();
}

/** Nombre d'entrees TMDB reellement trouvees (proxy "TMDB operationnel"). */
export function countTmdbFound(): Promise<number> {
  return db.tmdb_cache.filter((e) => e.status === 'found').count();
}
