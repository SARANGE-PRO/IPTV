import { db } from '@/db/database';
import type { SearchIndexEntry } from '@/types/models';

/**
 * Index inverse local pour la recherche instantanee sur gros catalogue.
 * Reconstruit apres chaque sync (etape 4/5) — la tokenisation et les
 * stop-words appartiennent au builder, pas au repository.
 */

export async function replaceSearchIndex(entries: SearchIndexEntry[]): Promise<void> {
  await db.transaction('rw', db.search_index, async () => {
    await db.search_index.clear();
    await db.search_index.bulkPut(entries);
  });
}

/** Postings d'un token exact ("type:id"[]), vide si token inconnu. */
export async function getTokenRefs(token: string): Promise<string[]> {
  const entry = await db.search_index.get(token);
  return entry?.refs ?? [];
}

/** Tokens commencant par un prefixe — pour la recherche a la frappe. */
export function getTokensByPrefix(prefix: string, limit: number): Promise<SearchIndexEntry[]> {
  return db.search_index.where('token').startsWith(prefix).limit(limit).toArray();
}

export async function clearSearchIndex(): Promise<void> {
  await db.search_index.clear();
}
