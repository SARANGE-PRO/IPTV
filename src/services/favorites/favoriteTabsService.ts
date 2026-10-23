import * as favoriteTabsRepository from '@/db/repositories/favoriteTabsRepository';
import * as favoritesRepository from '@/db/repositories/favoritesRepository';
import type { FavoriteEntry, FavoriteTab, FavoriteTabItem, MediaType } from '@/types/models';

/**
 * Onglets de favoris : regles metier (noms, ordre, coherence avec les
 * favoris). Invariant : un element range dans un onglet est TOUJOURS un
 * favori ; retirer un favori le retire de tous ses onglets (annulable).
 */

export const TAB_NAME_MAX = 24;

/** Cle d'element stable entre types (« live:123 », « vod:45 »). */
export const itemKey = (type: MediaType, itemId: string): string => `${type}:${itemId}`;

export function parseItemKey(key: string): { type: MediaType; itemId: string } {
  const at = key.indexOf(':');
  return { type: key.slice(0, at) as MediaType, itemId: key.slice(at + 1) };
}

function newId(): string {
  const c = globalThis.crypto;
  if (c !== undefined && typeof c.randomUUID === 'function') return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Nom propre et unique (« Sport » existe deja -> « Sport 2 »). */
export function normalizeTabName(raw: string, existing: FavoriteTab[], exceptId?: string): string {
  const base = raw.replace(/\s+/g, ' ').trim().slice(0, TAB_NAME_MAX) || 'Nouvel onglet';
  const taken = new Set(
    existing.filter((t) => t.id !== exceptId).map((t) => t.name.toLocaleLowerCase('fr')),
  );
  if (!taken.has(base.toLocaleLowerCase('fr'))) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base.slice(0, TAB_NAME_MAX - String(n).length - 1)} ${n}`;
    if (!taken.has(candidate.toLocaleLowerCase('fr'))) return candidate;
  }
}

export interface TabsSnapshot {
  tabs: FavoriteTab[];
  /** Elements par onglet, dans l'ordre de l'onglet. */
  items: Record<string, FavoriteTabItem[]>;
}

export async function loadTabs(): Promise<TabsSnapshot> {
  const [tabs, rows] = await Promise.all([favoriteTabsRepository.getTabs(), favoriteTabsRepository.getAllTabItems()]);
  const items: Record<string, FavoriteTabItem[]> = Object.fromEntries(tabs.map((t) => [t.id, []]));
  for (const row of rows) items[row.tabId]?.push(row);
  for (const list of Object.values(items)) list.sort((a, b) => a.position - b.position);
  return { tabs, items };
}

export async function createTab(name: string, existing: FavoriteTab[]): Promise<FavoriteTab> {
  const tab: FavoriteTab = {
    id: newId(),
    name: normalizeTabName(name, existing),
    position: existing.reduce((max, t) => Math.max(max, t.position), -1) + 1,
    createdAt: Date.now(),
  };
  await favoriteTabsRepository.putTab(tab);
  return tab;
}

export async function renameTab(tab: FavoriteTab, name: string, existing: FavoriteTab[]): Promise<FavoriteTab> {
  const next = { ...tab, name: normalizeTabName(name, existing, tab.id) };
  await favoriteTabsRepository.putTab(next);
  return next;
}

export function deleteTab(tabId: string): Promise<void> {
  return favoriteTabsRepository.deleteTab(tabId);
}

/** Nouvel ordre des onglets (positions 0..n-1). */
export async function reorderTabs(ordered: FavoriteTab[]): Promise<FavoriteTab[]> {
  const next = ordered.map((tab, position) => ({ ...tab, position }));
  await favoriteTabsRepository.putTabs(next);
  return next;
}

/**
 * Range un element dans exactement `tabIds` (ajoute / retire selon le cas) ;
 * le marque favori s'il ne l'etait pas. Les ajouts vont en fin d'onglet.
 */
export async function setItemTabs(
  type: MediaType,
  itemId: string,
  tabIds: string[],
  current: Record<string, FavoriteTabItem[]>,
): Promise<{ added: FavoriteTabItem[]; removedFrom: string[]; becameFavorite: boolean }> {
  const wanted = new Set(tabIds);
  const added: FavoriteTabItem[] = [];
  const removedFrom: string[] = [];
  for (const [tabId, list] of Object.entries(current)) {
    const inTab = list.some((i) => i.type === type && i.itemId === itemId);
    if (wanted.has(tabId) && !inTab) {
      const position = list.reduce((max, i) => Math.max(max, i.position), -1) + 1;
      added.push({ tabId, type, itemId, position, addedAt: Date.now() });
    } else if (!wanted.has(tabId) && inTab) {
      removedFrom.push(tabId);
    }
  }
  const becameFavorite = wanted.size > 0 ? await favoritesRepository.ensureFavorite(type, itemId) : false;
  if (added.length > 0) await favoriteTabsRepository.putTabItems(added);
  for (const tabId of removedFrom) await favoriteTabsRepository.deleteTabItem(tabId, type, itemId);
  return { added, removedFrom, becameFavorite };
}

/** Nouvel ordre d'un onglet a partir des cles d'elements. */
export async function reorderTab(
  tabId: string,
  orderedKeys: string[],
  current: FavoriteTabItem[],
): Promise<FavoriteTabItem[]> {
  const addedAt = new Map(current.map((i) => [itemKey(i.type, i.itemId), i.addedAt] as const));
  const next = orderedKeys.map((key, position) => {
    const { type, itemId } = parseItemKey(key);
    return { tabId, type, itemId, position, addedAt: addedAt.get(key) ?? Date.now() };
  });
  await favoriteTabsRepository.putTabItems(next);
  return next;
}

export interface RemovedFavorite {
  entry: FavoriteEntry;
  tabItems: FavoriteTabItem[];
}

/** Retire un favori et ses rangements ; renvoie de quoi l'annuler. */
export async function removeFavorite(type: MediaType, itemId: string): Promise<RemovedFavorite | null> {
  const entry = await favoritesRepository.getFavorite(type, itemId);
  if (entry === undefined) return null;
  await favoritesRepository.removeFavorite(type, itemId);
  const tabItems = await favoriteTabsRepository.deleteItemFromAllTabs(type, itemId);
  return { entry, tabItems };
}

export async function restoreFavorite(removed: RemovedFavorite): Promise<void> {
  await favoritesRepository.restoreFavorite(removed.entry);
  if (removed.tabItems.length > 0) await favoriteTabsRepository.putTabItems(removed.tabItems);
}

export async function addFavorite(type: MediaType, itemId: string): Promise<void> {
  await favoritesRepository.ensureFavorite(type, itemId);
}

export function reorderFavorites(type: MediaType, orderedIds: string[]): Promise<void> {
  return favoritesRepository.setFavoritePositions(type, orderedIds);
}

/**
 * Ordre « Mon ordre » des favoris : jamais reordonnes d'abord (plus recents en
 * tete), puis ceux places a la main dans leur ordre.
 */
export function compareFavoriteOrder(a: FavoriteEntry, b: FavoriteEntry): number {
  const pa = a.position;
  const pb = b.position;
  if (pa === undefined && pb === undefined) return b.addedAt - a.addedAt;
  if (pa === undefined) return -1;
  if (pb === undefined) return 1;
  return pa - pb;
}
