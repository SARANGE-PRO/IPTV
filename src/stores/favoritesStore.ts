import { create } from 'zustand';
import * as favoritesRepository from '@/db/repositories/favoritesRepository';
import * as favoriteTabsService from '@/services/favorites/favoriteTabsService';
import type { RemovedFavorite } from '@/services/favorites/favoriteTabsService';
import type { FavoriteTab, FavoriteTabItem, MediaType } from '@/types/models';

/**
 * Favoris en memoire (Sets d'ids, verification O(1)) + onglets crees par
 * l'utilisateur (petits volumes) — persistes via Dexie. Un retrait est
 * annulable (`lastRemoved` + `undoRemove`, toast « Annuler »).
 */

const MEDIA_TYPES: readonly MediaType[] = ['live', 'vod', 'series', 'episode'];

const emptyIds = (): Record<MediaType, Set<string>> => ({
  live: new Set<string>(),
  vod: new Set<string>(),
  series: new Set<string>(),
  episode: new Set<string>(),
});

/** Onglets contenant chaque element (cle `type:itemId`). */
function buildMembership(items: Record<string, FavoriteTabItem[]>): Map<string, Set<string>> {
  const membership = new Map<string, Set<string>>();
  for (const [tabId, list] of Object.entries(items)) {
    for (const item of list) {
      const key = favoriteTabsService.itemKey(item.type, item.itemId);
      const tabs = membership.get(key);
      if (tabs === undefined) membership.set(key, new Set([tabId]));
      else tabs.add(tabId);
    }
  }
  return membership;
}

interface FavoritesState {
  ids: Record<MediaType, Set<string>>;
  hydrated: boolean;
  tabs: FavoriteTab[];
  tabItems: Record<string, FavoriteTabItem[]>;
  membership: Map<string, Set<string>>;
  /** Dernier favori retire (toast d'annulation), null sinon. */
  lastRemoved: { removed: RemovedFavorite; at: number } | null;
  /** Revision de l'ordre manuel (les vues relisent l'ordre des favoris). */
  orderRevision: number;
  hydrate: () => Promise<void>;
  toggle: (type: MediaType, itemId: string) => Promise<void>;
  remove: (type: MediaType, itemId: string) => Promise<void>;
  undoRemove: () => Promise<void>;
  dismissUndo: () => void;
  createTab: (name: string) => Promise<FavoriteTab>;
  renameTab: (tabId: string, name: string) => Promise<void>;
  deleteTab: (tabId: string) => Promise<void>;
  reorderTabs: (orderedIds: string[]) => Promise<void>;
  setItemTabs: (type: MediaType, itemId: string, tabIds: string[]) => Promise<void>;
  reorderTab: (tabId: string, orderedKeys: string[]) => Promise<void>;
  reorderFavorites: (type: MediaType, orderedIds: string[]) => Promise<void>;
}

export const useFavoritesStore = create<FavoritesState>()((set, get) => {
  const setIds = (type: MediaType, itemId: string, present: boolean) => {
    const next = new Set(get().ids[type]);
    if (present) next.add(itemId);
    else next.delete(itemId);
    set((state) => ({ ids: { ...state.ids, [type]: next } }));
  };

  const setTabItems = (tabItems: Record<string, FavoriteTabItem[]>) =>
    set({ tabItems, membership: buildMembership(tabItems) });

  return {
    ids: emptyIds(),
    hydrated: false,
    tabs: [],
    tabItems: {},
    membership: new Map(),
    lastRemoved: null,
    orderRevision: 0,

    hydrate: async () => {
      const [sets, snapshot] = await Promise.all([
        Promise.all(MEDIA_TYPES.map((t) => favoritesRepository.getFavoriteIdSet(t))),
        favoriteTabsService.loadTabs(),
      ]);
      const ids = emptyIds();
      MEDIA_TYPES.forEach((t, i) => {
        ids[t] = sets[i] ?? new Set<string>();
      });
      set({ ids, hydrated: true, tabs: snapshot.tabs });
      setTabItems(snapshot.items);
    },

    toggle: async (type, itemId) => {
      if (get().ids[type].has(itemId)) {
        await get().remove(type, itemId);
        return;
      }
      await favoriteTabsService.addFavorite(type, itemId);
      setIds(type, itemId, true);
    },

    remove: async (type, itemId) => {
      const removed = await favoriteTabsService.removeFavorite(type, itemId);
      setIds(type, itemId, false);
      if (removed === null) return;
      if (removed.tabItems.length > 0) {
        const tabItems = { ...get().tabItems };
        for (const item of removed.tabItems) {
          tabItems[item.tabId] = (tabItems[item.tabId] ?? []).filter(
            (i) => !(i.type === type && i.itemId === itemId),
          );
        }
        setTabItems(tabItems);
      }
      set({ lastRemoved: { removed, at: Date.now() } });
    },

    undoRemove: async () => {
      const last = get().lastRemoved;
      if (last === null) return;
      set({ lastRemoved: null });
      const { removed } = last;
      await favoriteTabsService.restoreFavorite(removed);
      setIds(removed.entry.type, removed.entry.itemId, true);
      if (removed.tabItems.length > 0) {
        const tabItems = { ...get().tabItems };
        for (const item of removed.tabItems) {
          tabItems[item.tabId] = [...(tabItems[item.tabId] ?? []), item].sort((a, b) => a.position - b.position);
        }
        setTabItems(tabItems);
      }
    },

    dismissUndo: () => set({ lastRemoved: null }),

    createTab: async (name) => {
      const tab = await favoriteTabsService.createTab(name, get().tabs);
      set((state) => ({ tabs: [...state.tabs, tab] }));
      setTabItems({ ...get().tabItems, [tab.id]: [] });
      return tab;
    },

    renameTab: async (tabId, name) => {
      const tab = get().tabs.find((t) => t.id === tabId);
      if (tab === undefined) return;
      const next = await favoriteTabsService.renameTab(tab, name, get().tabs);
      set((state) => ({ tabs: state.tabs.map((t) => (t.id === tabId ? next : t)) }));
    },

    deleteTab: async (tabId) => {
      await favoriteTabsService.deleteTab(tabId);
      const { [tabId]: _removed, ...rest } = get().tabItems;
      set((state) => ({ tabs: state.tabs.filter((t) => t.id !== tabId) }));
      setTabItems(rest);
    },

    reorderTabs: async (orderedIds) => {
      const byId = new Map(get().tabs.map((t) => [t.id, t] as const));
      const ordered = orderedIds.flatMap((id) => {
        const tab = byId.get(id);
        return tab !== undefined ? [tab] : [];
      });
      set({ tabs: await favoriteTabsService.reorderTabs(ordered) });
    },

    setItemTabs: async (type, itemId, tabIds) => {
      const { added, removedFrom, becameFavorite } = await favoriteTabsService.setItemTabs(
        type,
        itemId,
        tabIds,
        get().tabItems,
      );
      if (becameFavorite) setIds(type, itemId, true);
      const tabItems = { ...get().tabItems };
      for (const item of added) tabItems[item.tabId] = [...(tabItems[item.tabId] ?? []), item];
      for (const tabId of removedFrom) {
        tabItems[tabId] = (tabItems[tabId] ?? []).filter((i) => !(i.type === type && i.itemId === itemId));
      }
      setTabItems(tabItems);
    },

    reorderTab: async (tabId, orderedKeys) => {
      const current = get().tabItems[tabId] ?? [];
      const next = await favoriteTabsService.reorderTab(tabId, orderedKeys, current);
      // Reordonnancement d'UN type (chaines, films…) : les autres restent.
      const moved = new Set(orderedKeys);
      const kept = current.filter((i) => !moved.has(favoriteTabsService.itemKey(i.type, i.itemId)));
      setTabItems({ ...get().tabItems, [tabId]: [...kept, ...next].sort((a, b) => a.position - b.position) });
    },

    reorderFavorites: async (type, orderedIds) => {
      await favoriteTabsService.reorderFavorites(type, orderedIds);
      set((state) => ({ orderRevision: state.orderRevision + 1 }));
    },
  };
});
