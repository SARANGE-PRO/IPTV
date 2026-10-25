import { personalDb } from '@/db/personalDb';
import type { FavoriteEntry, MediaType } from '@/types/models';

/** Favoris multi-types (live, vod, series, episode). Cle composite [type+itemId]. */

export async function addFavorite(type: MediaType, itemId: string): Promise<void> {
  await personalDb().favorites.put({ type, itemId, addedAt: Date.now() });
}

export async function removeFavorite(type: MediaType, itemId: string): Promise<void> {
  await personalDb().favorites.delete([type, itemId]);
}

/** Bascule et renvoie le nouvel etat (true = desormais favori). */
export function toggleFavorite(type: MediaType, itemId: string): Promise<boolean> {
  return personalDb().transaction('rw', personalDb().favorites, async () => {
    const existing = await personalDb().favorites.get([type, itemId]);
    if (existing !== undefined) {
      await personalDb().favorites.delete([type, itemId]);
      return false;
    }
    await personalDb().favorites.put({ type, itemId, addedAt: Date.now() });
    return true;
  });
}

export async function isFavorite(type: MediaType, itemId: string): Promise<boolean> {
  return (await personalDb().favorites.get([type, itemId])) !== undefined;
}

export async function getFavoritesByType(type: MediaType): Promise<FavoriteEntry[]> {
  const rows = await personalDb().favorites.where('type').equals(type).toArray();
  return rows.sort((a, b) => b.addedAt - a.addedAt);
}

export function getAllFavorites(): Promise<FavoriteEntry[]> {
  return personalDb().favorites.orderBy('addedAt').reverse().toArray();
}

/** Ids favoris d'un type — pour hydrater un Set et verifier en O(1) dans le store. */
export async function getFavoriteIdSet(type: MediaType): Promise<Set<string>> {
  const rows = await personalDb().favorites.where('type').equals(type).toArray();
  return new Set(rows.map((r) => r.itemId));
}

export function getFavorite(type: MediaType, itemId: string): Promise<FavoriteEntry | undefined> {
  return personalDb().favorites.get([type, itemId]);
}

/** Remet un favori tel qu'il etait (annulation d'un retrait). */
export async function restoreFavorite(entry: FavoriteEntry): Promise<void> {
  await personalDb().favorites.put(entry);
}

/** Ajoute un favori s'il n'existe pas (date d'ajout d'origine conservee sinon). */
export async function ensureFavorite(type: MediaType, itemId: string): Promise<boolean> {
  return personalDb().transaction('rw', personalDb().favorites, async () => {
    if ((await personalDb().favorites.get([type, itemId])) !== undefined) return false;
    await personalDb().favorites.put({ type, itemId, addedAt: Date.now() });
    return true;
  });
}

/** Ordre personnalise : position = index dans `orderedIds` (glisser-deposer). */
export function setFavoritePositions(type: MediaType, orderedIds: string[]): Promise<void> {
  return personalDb().transaction('rw', personalDb().favorites, async () => {
    const rows = await personalDb().favorites.bulkGet(orderedIds.map((id) => [type, id] as [MediaType, string]));
    const next = rows.flatMap((row, position) => (row !== undefined ? [{ ...row, position }] : []));
    await personalDb().favorites.bulkPut(next);
  });
}

export async function clearFavorites(): Promise<void> {
  await personalDb().favorites.clear();
}
