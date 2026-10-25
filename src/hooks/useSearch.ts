'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDebounce } from '@/hooks/useDebounce';
import { loadTrending, type TrendingResult } from '@/services/discovery/trendingService';
import {
  clearRecentSearches,
  getRecentSearches,
  rememberSearch,
  removeRecentSearch,
  searchGenres,
  searchPerson,
  searchTitles,
  type GenreMatch,
  type PersonMatch,
  type TitleResults,
} from '@/services/search/searchService';
import { useCatalogStore } from '@/stores/catalogStore';
import { useFilterStore } from '@/stores/filterStore';
import { useUiSettingsStore } from '@/stores/uiSettingsStore';
import { variantOrder } from '@/utils/variantPreference';

/**
 * Etat de la page Recherche (chantier P7). Titres locaux immediats (300 ms),
 * puis genres (local) et personnes (TMDB) en complement, sans bloquer.
 * Requete vide : recherches recentes + tendances.
 */

const EMPTY_TITLES: TitleResults = { movies: [], series: [], live: [], liveTotal: 0 };
const EMPTY_TRENDING: TrendingResult = { movies: [], series: [] };

export interface SearchState {
  debounced: string;
  active: boolean;
  loading: boolean;
  error: boolean;
  titles: TitleResults;
  genres: GenreMatch[];
  person: PersonMatch | null;
  /** Personne en cours de recherche (TMDB). */
  personLoading: boolean;
  recent: string[];
  trending: TrendingResult;
  retry: () => void;
  remember: (query: string) => void;
  forget: (query: string) => void;
  clearRecent: () => void;
}

export function useSearch(query: string): SearchState {
  const debounced = useDebounce(query.trim(), 300);
  const active = debounced.length >= 2;
  const hiddenLive = useFilterStore((s) => s.hidden.live);
  const hiddenVod = useFilterStore((s) => s.hidden.vod);
  const hiddenSeries = useFilterStore((s) => s.hidden.series);
  const preferredLanguage = useUiSettingsStore((s) => s.preferredLanguage);
  const vod = useCatalogStore((s) => s.sections.vod);
  const seriesSlice = useCatalogStore((s) => s.sections.series);
  const order = useMemo(() => variantOrder(preferredLanguage), [preferredLanguage]);
  const hidden = useMemo(() => ({ live: hiddenLive, vod: hiddenVod, series: hiddenSeries }), [hiddenLive, hiddenVod, hiddenSeries]);

  const [titles, setTitles] = useState<TitleResults>(EMPTY_TITLES);
  const [genres, setGenres] = useState<GenreMatch[]>([]);
  const [person, setPerson] = useState<PersonMatch | null>(null);
  const [personLoading, setPersonLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
  const [trending, setTrending] = useState<TrendingResult>(EMPTY_TRENDING);

  useEffect(() => {
    void getRecentSearches().then(setRecent);
  }, []);

  // Suggestions (requete vide) : tendances, memo partage avec l'accueil.
  useEffect(() => {
    if (vod.itemCount + seriesSlice.itemCount === 0) return;
    let alive = true;
    const memoKey = `${vod.itemCount}:${seriesSlice.itemCount}:${vod.lastFetchAt ?? 0}:${preferredLanguage}`;
    void loadTrending(10, memoKey)
      .then((t) => alive && setTrending(t))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [vod.itemCount, vod.lastFetchAt, seriesSlice.itemCount, preferredLanguage]);

  // Titres (local, rapide).
  useEffect(() => {
    if (!active) {
      setTitles(EMPTY_TITLES);
      setError(false);
      return;
    }
    let alive = true;
    setLoading(true);
    setError(false);
    void searchTitles(debounced, order, hidden)
      .then((r) => alive && setTitles(r))
      .catch(() => {
        if (!alive) return;
        setTitles(EMPTY_TITLES);
        setError(true);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [active, debounced, order, hidden, attempt]);

  // Genres (local) + personne (TMDB) : complements non bloquants.
  useEffect(() => {
    setGenres([]);
    setPerson(null);
    if (!active) {
      setPersonLoading(false);
      return;
    }
    let alive = true;
    void searchGenres(debounced, order, hidden)
      .then((g) => alive && setGenres(g))
      .catch(() => {});
    setPersonLoading(debounced.length >= 3);
    void searchPerson(debounced, hidden)
      .then((p) => alive && setPerson(p))
      .finally(() => alive && setPersonLoading(false));
    return () => {
      alive = false;
    };
  }, [active, debounced, order, hidden, attempt]);

  const remember = useCallback((q: string) => {
    void rememberSearch(q).then(setRecent);
  }, []);
  const forget = useCallback((q: string) => {
    void removeRecentSearch(q).then(setRecent);
  }, []);
  const clearRecent = useCallback(() => {
    void clearRecentSearches().then(() => setRecent([]));
  }, []);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return {
    debounced,
    active,
    loading,
    error,
    titles,
    genres,
    person,
    personLoading,
    recent,
    trending,
    retry,
    remember,
    forget,
    clearRecent,
  };
}
