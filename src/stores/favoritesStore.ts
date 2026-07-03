import { create } from 'zustand';
import * as favoritesRepository from '@/db/repositories/favoritesRepository';
import type { MediaType } from '@/types/models';

/** Favoris en memoire (Sets d'ids, verification O(1)) — persistes via Dexie. */

const MEDIA_TYPES: readonly MediaType[] = ['live', 'vod', 'series', 'episode'];

interface FavoritesState {
  ids: Record<MediaType, Set<string>>;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  toggle: (type: MediaType, itemId: string) => Promise<void>;
}

export const useFavoritesStore = create<FavoritesState>()((set, get) => ({
  ids: {
    live: new Set<string>(),
    vod: new Set<string>(),
    series: new Set<string>(),
    episode: new Set<string>(),
  },
  hydrated: false,

  hydrate: async () => {
    const sets = await Promise.all(MEDIA_TYPES.map((t) => favoritesRepository.getFavoriteIdSet(t)));
    const ids: Record<MediaType, Set<string>> = {
      live: sets[0] ?? new Set<string>(),
      vod: sets[1] ?? new Set<string>(),
      series: sets[2] ?? new Set<string>(),
      episode: sets[3] ?? new Set<string>(),
    };
    set({ ids, hydrated: true });
  },

  toggle: async (type, itemId) => {
    const nowFavorite = await favoritesRepository.toggleFavorite(type, itemId);
    const next = new Set(get().ids[type]);
    if (nowFavorite) next.add(itemId);
    else next.delete(itemId);
    set((state) => ({ ids: { ...state.ids, [type]: next } }));
  },
}));
