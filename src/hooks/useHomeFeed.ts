'use client';

import { useEffect, useMemo, useState } from 'react';
import * as catalogService from '@/services/data/catalogService';
import { loadTrending, type TrendingResult } from '@/services/discovery/trendingService';
import { loadContinueWatching, type ContinueItem } from '@/services/home/continueWatchingService';
import {
  loadBecauseYouWatched,
  loadBillboard,
  loadGenreRails,
  loadMyList,
  type BecauseRail,
  type BillboardItem,
  type GenreRail,
  type MyListEntry,
} from '@/services/home/homeRailsService';
import { getMovieTop10, getSeriesTop10 } from '@/services/ranking/smartRankingService';
import { useCatalogStore } from '@/stores/catalogStore';
import { useFavoritesStore } from '@/stores/favoritesStore';
import { useFilterStore } from '@/stores/filterStore';
import { usePlaybackStore } from '@/stores/playbackStore';
import { useUiSettingsStore } from '@/stores/uiSettingsStore';
import type { LiveChannel, Movie, Series } from '@/types/models';
import { variantOrder } from '@/utils/variantPreference';

/**
 * Orchestration de l'ACCUEIL (chantier P4). Chaque bloc se charge
 * independamment (affichage progressif : « Continuer » et « Ma liste »
 * apparaissent tout de suite, les rangees plus couteuses ensuite). Aucune
 * logique metier ici : tout vient de services/home/*.
 */

export interface HomeDiscovery {
  topMovies: Movie[];
  topSeries: Series[];
  newFrMovies: Movie[];
  newFrSeries: Series[];
  because: BecauseRail[];
  movieGenres: GenreRail<Movie>[];
  seriesGenres: GenreRail<Series>[];
  liveSports: LiveChannel[];
}

const EMPTY_DISCOVERY: HomeDiscovery = {
  topMovies: [],
  topSeries: [],
  newFrMovies: [],
  newFrSeries: [],
  because: [],
  movieGenres: [],
  seriesGenres: [],
  liveSports: [],
};

const EMPTY_TRENDING: TrendingResult = { movies: [], series: [] };

export interface HomeFeed {
  hasCatalog: boolean;
  billboard: BillboardItem[];
  /** Billboard pas encore calcule : la page lui reserve sa place (pas de saut). */
  billboardPending: boolean;
  continueItems: ContinueItem[];
  myList: MyListEntry[];
  trending: TrendingResult;
  discovery: HomeDiscovery;
  discoveryLoading: boolean;
}

const notHidden =
  (hidden: ReadonlySet<string>) =>
  <T extends { categoryId: string; posterUrl?: string | null; logoUrl?: string | null }>(row: T): boolean =>
    !hidden.has(row.categoryId);

/** Billboard deja calcule dans la session (null : jamais). */
let lastBillboard: BillboardItem[] | null = null;

export function useHomeFeed(): HomeFeed {
  const sections = useCatalogStore((s) => s.sections);
  const continueTrigger = usePlaybackStore((s) => s.continueWatching);
  const hydrateRails = usePlaybackStore((s) => s.hydrateRails);
  const favVod = useFavoritesStore((s) => s.ids.vod);
  const favSeries = useFavoritesStore((s) => s.ids.series);
  const hiddenLive = useFilterStore((s) => s.hidden.live);
  const hiddenVod = useFilterStore((s) => s.hidden.vod);
  const hiddenSeries = useFilterStore((s) => s.hidden.series);
  const preferredLanguage = useUiSettingsStore((s) => s.preferredLanguage);
  const regrouping = useUiSettingsStore((s) => s.regrouping);

  const hasCatalog = sections.live.itemCount + sections.vod.itemCount + sections.series.itemCount > 0;
  const catalogKey = `${sections.vod.itemCount}:${sections.series.itemCount}:${sections.vod.lastFetchAt ?? 0}`;
  const order = useMemo(() => variantOrder(preferredLanguage), [preferredLanguage]);

  const [continueItems, setContinueItems] = useState<ContinueItem[]>([]);
  const [myList, setMyList] = useState<MyListEntry[]>([]);
  const [trending, setTrending] = useState<TrendingResult>(EMPTY_TRENDING);
  // Dernier billboard de la session : affiche aussitot au retour sur l'accueil.
  const [billboard, setBillboard] = useState<BillboardItem[]>(() => lastBillboard ?? []);
  const [billboardReady, setBillboardReady] = useState(() => lastBillboard !== null);
  const [discovery, setDiscovery] = useState<HomeDiscovery>(EMPTY_DISCOVERY);
  const [discoveryLoading, setDiscoveryLoading] = useState(false);

  useEffect(() => {
    void hydrateRails();
  }, [hydrateRails]);

  // « Continuer a regarder » : se recalcule a chaque changement d'historique.
  useEffect(() => {
    if (!hasCatalog) {
      setContinueItems([]);
      return;
    }
    let alive = true;
    void loadContinueWatching(15).then((items) => {
      if (alive) setContinueItems(items);
    });
    return () => {
      alive = false;
    };
  }, [hasCatalog, continueTrigger, catalogKey]);

  // « Ma liste » : favoris films + series.
  useEffect(() => {
    if (!hasCatalog) {
      setMyList([]);
      return;
    }
    let alive = true;
    void loadMyList(24).then((list) => {
      if (alive) setMyList(list);
    });
    return () => {
      alive = false;
    };
  }, [hasCatalog, favVod, favSeries, catalogKey]);

  // Tendances TMDB (mappees au catalogue) -> billboard. Jamais bloquant.
  useEffect(() => {
    if (!hasCatalog || regrouping) return;
    let alive = true;
    void loadTrending(10, `${catalogKey}:${preferredLanguage}`)
      .catch(() => EMPTY_TRENDING)
      .then(async (t) => {
        if (!alive) return;
        setTrending(t);
        const bb = await loadBillboard(t).catch(() => []);
        if (!alive) return;
        lastBillboard = bb;
        setBillboard(bb);
        setBillboardReady(true);
      });
    return () => {
      alive = false;
    };
  }, [hasCatalog, regrouping, catalogKey, preferredLanguage]);

  // Rangees de decouverte (Top 10, nouveautes VF, genres, « parce que »).
  useEffect(() => {
    if (!hasCatalog || regrouping) {
      setDiscovery(EMPTY_DISCOVERY);
      return;
    }
    let alive = true;
    setDiscoveryLoading(true);
    const vodOk = notHidden(hiddenVod);
    const seriesOk = notHidden(hiddenSeries);
    const run = async (): Promise<void> => {
      // 1) Rangees rapides d'abord (index directs).
      const [topMovies, topSeries, newFrMovies, newFrSeries, liveSports] = await Promise.all([
        getMovieTop10(10),
        getSeriesTop10(10),
        catalogService.getFrenchMovies(24, 'recent'),
        catalogService.getFrenchSeries(24, 'recent'),
        catalogService.getLiveChannelsPage({ kind: 'frenchTheme', theme: 'sport' }, 0, 12),
      ]);
      if (!alive) return;
      const quick: HomeDiscovery = {
        ...EMPTY_DISCOVERY,
        topMovies: topMovies.filter(vodOk),
        topSeries: topSeries.filter(seriesOk),
        newFrMovies: newFrMovies.filter((m) => vodOk(m) && m.posterUrl !== null).slice(0, 18),
        newFrSeries: newFrSeries.filter((s) => seriesOk(s) && s.posterUrl !== null).slice(0, 18),
        liveSports: liveSports.filter(notHidden(hiddenLive)),
      };
      setDiscovery(quick);
      // 2) Rangees « intelligentes » (parcours d'index bornes), en sequence.
      const because = await loadBecauseYouWatched(order, hiddenVod, hiddenSeries);
      if (!alive) return;
      setDiscovery((d) => ({ ...d, because }));
      const movieGenres = await loadGenreRails('vod', order, hiddenVod, 4);
      if (!alive) return;
      setDiscovery((d) => ({ ...d, movieGenres }));
      const seriesGenres = await loadGenreRails('series', order, hiddenSeries, 2);
      if (!alive) return;
      setDiscovery((d) => ({ ...d, seriesGenres }));
    };
    void run()
      .catch(() => {
        // Une rangee en echec ne doit jamais casser l'accueil.
      })
      .finally(() => {
        if (alive) setDiscoveryLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [hasCatalog, regrouping, catalogKey, order, hiddenLive, hiddenVod, hiddenSeries]);

  const billboardPending = hasCatalog && !billboardReady;
  return { hasCatalog, billboard, billboardPending, continueItems, myList, trending, discovery, discoveryLoading };
}
