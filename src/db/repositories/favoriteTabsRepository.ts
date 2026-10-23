import { db } from '@/db/database';
import type { FavoriteTab, FavoriteTabItem, MediaType } from '@/types/models';

/**
 * Onglets de favoris (schema v11). Petits volumes (quelques dizaines
 * d'onglets, quelques centaines d'elements) : lectures completes assumees.
 * Invariant tenu par le service : tout element d'onglet est aussi un favori.
 */

export function getTabs(): Promise<FavoriteTab[]> {
  return db.favorite_tabs.orderBy('position').toArray();
}

export function getAllTabItems(): Promise<FavoriteTabItem[]> {
  return db.favorite_tab_items.toArray();
}

export async function putTab(tab: FavoriteTab): Promise<void> {
  await db.favorite_tabs.put(tab);
}

export async function putTabs(tabs: FavoriteTab[]): Promise<void> {
  await db.favorite_tabs.bulkPut(tabs);
}

/** Supprime l'onglet ET son contenu (les favoris eux-memes restent). */
export function deleteTab(tabId: string): Promise<void> {
  return db.transaction('rw', db.favorite_tabs, db.favorite_tab_items, async () => {
    await db.favorite_tab_items.where('tabId').equals(tabId).delete();
    await db.favorite_tabs.delete(tabId);
  });
}

export async function putTabItems(items: FavoriteTabItem[]): Promise<void> {
  await db.favorite_tab_items.bulkPut(items);
}

export async function deleteTabItem(tabId: string, type: MediaType, itemId: string): Promise<void> {
  await db.favorite_tab_items.delete([tabId, type, itemId]);
}

/** Retire un element de tous les onglets ; renvoie les onglets concernes. */
export function deleteItemFromAllTabs(type: MediaType, itemId: string): Promise<FavoriteTabItem[]> {
  return db.transaction('rw', db.favorite_tab_items, async () => {
    const rows = await db.favorite_tab_items.where('[type+itemId]').equals([type, itemId]).toArray();
    await db.favorite_tab_items.where('[type+itemId]').equals([type, itemId]).delete();
    return rows;
  });
}

export async function clearFavoriteTabs(): Promise<void> {
  await db.transaction('rw', db.favorite_tabs, db.favorite_tab_items, async () => {
    await db.favorite_tab_items.clear();
    await db.favorite_tabs.clear();
  });
}
