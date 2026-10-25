'use client';

import { useCallback, useEffect, useState } from 'react';
import * as catalogRepository from '@/services/data/catalogService';
import * as playbackRepository from '@/services/data/playbackDataService';
import { findSeriesVariants, type LanguageVariant } from '@/services/media/languageVariantService';
import { getSeriesDetailsCached } from '@/services/xtream/seriesDetailsService';
import { useAuthStore } from '@/stores/authStore';
import { useUiSettingsStore } from '@/stores/uiSettingsStore';
import type { PlaybackEntry, Series, SeriesDetails } from '@/types/models';

/**
 * Donnees de la fiche serie : la serie (undefined = chargement, null =
 * introuvable), ses versions de langue, saisons/episodes (cache Dexie + TTL,
 * charges a la demande) et la progression par episode.
 *  - `error` / `retry` : base locale illisible pour la serie elle-meme ;
 *  - `details === null` / `retryDetails` : episodes injoignables chez le panel ;
 *  - `progressKey` : episode qui joue -> la progression est relue a chaque changement.
 */
export function useSeriesDetail(seriesId: string, progressKey: string | null) {
  const credentials = useAuthStore((s) => s.credentials);
  const preferredLanguage = useUiSettingsStore((s) => s.preferredLanguage);

  const [attempt, setAttempt] = useState(0);
  const [series, setSeries] = useState<Series | null | undefined>(undefined);
  const [error, setError] = useState(false);
  const [variants, setVariants] = useState<LanguageVariant[]>([]);
  const [details, setDetails] = useState<SeriesDetails | null | undefined>(undefined);
  const [detailsRetry, setDetailsRetry] = useState(0);
  const [epProgress, setEpProgress] = useState<Map<string, PlaybackEntry>>(new Map());
  const [progressLoaded, setProgressLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    setSeries(undefined);
    setError(false);
    catalogRepository
      .getSeriesById(seriesId)
      .then((s) => {
        if (active) setSeries(s ?? null);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [seriesId, attempt]);

  // Versions de langue (series soeurs VF/VOSTFR/MULTI/VO).
  useEffect(() => {
    if (series === null || series === undefined) return;
    let active = true;
    findSeriesVariants(series, preferredLanguage)
      .then((vs) => {
        if (active) setVariants(vs);
      })
      .catch(() => {
        if (active) setVariants([]);
      });
    return () => {
      active = false;
    };
  }, [series, preferredLanguage]);

  // Saisons/episodes charges A LA DEMANDE (cache Dexie + TTL).
  useEffect(() => {
    if (credentials === null) return;
    let active = true;
    setDetails(undefined);
    getSeriesDetailsCached(credentials, seriesId, { force: detailsRetry > 0 })
      .then((d) => {
        if (active) setDetails(d);
      })
      .catch(() => {
        if (active) setDetails(null);
      });
    return () => {
      active = false;
    };
  }, [credentials, seriesId, detailsRetry]);

  const refreshProgress = useCallback(async () => {
    try {
      setEpProgress(await playbackRepository.getSeriesEpisodeProgress(seriesId));
    } catch {
      // Progression illisible : on garde la derniere connue (vide au pire).
    } finally {
      setProgressLoaded(true);
    }
  }, [seriesId]);

  useEffect(() => {
    void refreshProgress();
  }, [refreshProgress, progressKey]);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);
  const retryDetails = useCallback(() => setDetailsRetry((n) => n + 1), []);

  return { series, error, retry, variants, details, retryDetails, epProgress, progressLoaded, refreshProgress };
}
