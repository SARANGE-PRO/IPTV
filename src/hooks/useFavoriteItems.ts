import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getOrderedFavoriteIds,
  resolveChannels,
  resolveMovies,
  resolveSeries,
  type FavoriteChannel,
} from '@/services/favorites/favoriteItemsService';
import { useFavoritesStore } from '@/stores/favoritesStore';
import type { MediaType, Movie, Series } from '@/types/models';

/**
 * Contenu d'une vue de favoris : « Mes favoris » (tous, dans Mon ordre) ou un
 * onglet (ordre de l'onglet). `tabId` null = tous les favoris.
 */

export interface FavoriteItems {
  loading: boolean;
  /** Lecture en echec : distinct de « aucun favori » (voir `retry`). */
  error: boolean;
  channels: FavoriteChannel[];
  movies: Movie[];
  series: Series[];
  missing: number;
  /** Ids dans l'ordre affiche, par type (reordonnancement). */
  order: Record<'live' | 'vod' | 'series', string[]>;
}

export type FavoriteItemsView = FavoriteItems & { retry: () => void };

const TYPES = ['live', 'vod', 'series'] as const;

export function useFavoriteItems(tabId: string | null, types: readonly MediaType[] = TYPES): FavoriteItemsView {
  const ids = useFavoritesStore((s) => s.ids);
  const tabItems = useFavoritesStore((s) => (tabId !== null ? s.tabItems[tabId] : undefined));
  const orderRevision = useFavoritesStore((s) => s.orderRevision);
  // Cle texte : un tableau litteral passe par l'appelant ne relance pas l'effet.
  const typesKey = types.join(',');
  const wanted = useMemo(() => new Set(typesKey.split(',')), [typesKey]);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<FavoriteItems>({
    loading: true,
    error: false,
    channels: [],
    movies: [],
    series: [],
    missing: 0,
    order: { live: [], vod: [], series: [] },
  });

  useEffect(() => {
    let active = true;
    setState((prev) => ({ ...prev, loading: true, error: false }));
    const idsOf = async (type: 'live' | 'vod' | 'series'): Promise<string[]> => {
      if (!wanted.has(type)) return [];
      if (tabId === null) return getOrderedFavoriteIds(type);
      return (tabItems ?? []).filter((i) => i.type === type).map((i) => i.itemId);
    };
    void (async () => {
      const [liveIds, vodIds, seriesIds] = await Promise.all(TYPES.map(idsOf));
      const [channels, movies, series] = await Promise.all([
        resolveChannels(liveIds!),
        resolveMovies(vodIds!),
        resolveSeries(seriesIds!),
      ]);
      if (!active) return;
      setState({
        loading: false,
        error: false,
        channels: channels.items,
        movies: movies.items,
        series: series.items,
        missing: channels.missing + movies.missing + series.missing,
        order: {
          live: channels.items.map((c) => c.id),
          vod: movies.items.map((m) => m.id),
          series: series.items.map((s) => s.id),
        },
      });
    })().catch(() => {
      if (active) setState((prev) => ({ ...prev, loading: false, error: true }));
    });
    return () => {
      active = false;
    };
  }, [tabId, tabItems, ids, orderRevision, wanted, attempt]);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);
  return useMemo(() => ({ ...state, retry }), [state, retry]);
}
