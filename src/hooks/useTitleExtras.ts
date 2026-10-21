'use client';

import { useEffect, useMemo, useState } from 'react';
import { loadCollection, type CollectionResult } from '@/services/media/collectionService';
import { loadSimilarMovies, loadSimilarSeries } from '@/services/media/similarTitlesService';
import { useFilterStore } from '@/stores/filterStore';
import { useUiSettingsStore } from '@/stores/uiSettingsStore';
import type { Movie, Series } from '@/types/models';
import { variantOrder } from '@/utils/variantPreference';

/**
 * Contenus ANNEXES d'une fiche (chantier P5) : titres similaires et saga.
 * Non bloquants : la fiche s'affiche sans attendre.
 */

/** Genres de la source : ligne enrichie, sinon metadonnees TMDB de la fiche. */
function genresKey(genreIds: readonly number[]): string {
  return [...genreIds].sort((a, b) => a - b).join(',');
}

export function useSimilarMovies(groupKey: string | null, genreIds: readonly number[]): Movie[] {
  const preferred = useUiSettingsStore((s) => s.preferredLanguage);
  const hidden = useFilterStore((s) => s.hidden.vod);
  const order = useMemo(() => variantOrder(preferred), [preferred]);
  const key = genresKey(genreIds);
  const [items, setItems] = useState<Movie[]>([]);
  useEffect(() => {
    setItems([]);
    if (groupKey === null || key === '') return;
    let alive = true;
    const ids = key.split(',').map(Number);
    void loadSimilarMovies({ groupKey, genreIds: ids }, order, hidden, 18)
      .then((rows) => alive && setItems(rows))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [groupKey, key, order, hidden]);
  return items;
}

export function useSimilarSeries(groupKey: string | null, genreIds: readonly number[]): Series[] {
  const preferred = useUiSettingsStore((s) => s.preferredLanguage);
  const hidden = useFilterStore((s) => s.hidden.series);
  const order = useMemo(() => variantOrder(preferred), [preferred]);
  const key = genresKey(genreIds);
  const [items, setItems] = useState<Series[]>([]);
  useEffect(() => {
    setItems([]);
    if (groupKey === null || key === '') return;
    let alive = true;
    const ids = key.split(',').map(Number);
    void loadSimilarSeries({ groupKey, genreIds: ids }, order, hidden, 18)
      .then((rows) => alive && setItems(rows))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [groupKey, key, order, hidden]);
  return items;
}

export function useCollection(collectionId: number | null): CollectionResult | null {
  const [result, setResult] = useState<CollectionResult | null>(null);
  useEffect(() => {
    setResult(null);
    if (collectionId === null) return;
    let alive = true;
    void loadCollection(collectionId)
      .then((r) => alive && setResult(r))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [collectionId]);
  return result;
}
