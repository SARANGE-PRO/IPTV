'use client';

import { useCallback, useEffect, useState } from 'react';
import * as catalogRepository from '@/services/data/catalogService';
import * as playbackRepository from '@/services/data/playbackDataService';
import { findMovieVariants, pickPreferredVariant, type LanguageVariant } from '@/services/media/languageVariantService';
import { EMPTY_VOD_EXTRAS, loadVodExtras, type VodExtras } from '@/services/media/vodInfoService';
import { useAuthStore } from '@/stores/authStore';
import { useUiSettingsStore } from '@/stores/uiSettingsStore';
import type { Movie, PlaybackEntry } from '@/types/models';
import { isLowBandwidth } from '@/services/network/lowBandwidthService';

/**
 * Donnees de la fiche film : le film (undefined = chargement, null =
 * introuvable), sa progression, ses versions de langue et la version active,
 * les complements du panel. `error` : base locale illisible (`retry`).
 *
 * `resumeVariantId` : version qui joue deja (mini-lecteur) — la fiche rouverte
 * la garde au lieu de basculer sur la langue preferee (pas de rechargement).
 */
export function useMovieDetail(vodId: string, resumeVariantId: string | null) {
  const credentials = useAuthStore((s) => s.credentials);
  const preferredLanguage = useUiSettingsStore((s) => s.preferredLanguage);

  const [attempt, setAttempt] = useState(0);
  const [movie, setMovie] = useState<Movie | null | undefined>(undefined);
  const [error, setError] = useState(false);
  const [progress, setProgress] = useState<PlaybackEntry | null>(null);
  const [progressLoaded, setProgressLoaded] = useState(false);
  const [variants, setVariants] = useState<LanguageVariant[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [extras, setExtras] = useState<VodExtras>(EMPTY_VOD_EXTRAS);

  useEffect(() => {
    let active = true;
    setMovie(undefined);
    setError(false);
    catalogRepository
      .getMovieById(vodId)
      .then((m) => {
        if (active) setMovie(m ?? null);
      })
      .catch(() => {
        if (active) setError(true);
      });
    playbackRepository
      .getProgress('vod', vodId)
      .then((p) => {
        if (active) setProgress(p ?? null);
      })
      .catch(() => {
        // Progression illisible : la fiche reste utilisable (lecture depuis le debut).
        if (active) setProgress(null);
      })
      .finally(() => {
        if (active) setProgressLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [vodId, attempt]);

  // Versions de langue (VF/VOSTFR/MULTI/VO) : le provider duplique les entrees
  // par langue -> on regroupe les soeurs et on selectionne la langue preferee.
  useEffect(() => {
    if (movie === null || movie === undefined) return;
    let active = true;
    findMovieVariants(movie, preferredLanguage)
      .then((vs) => {
        if (!active) return;
        setVariants(vs);
        const resumed = resumeVariantId !== null ? vs.find((v) => v.id === resumeVariantId) : undefined;
        setActiveId(resumed?.id ?? pickPreferredVariant(vs, movie.id, preferredLanguage)?.id ?? movie.id);
      })
      .catch(() => {
        // Sans versions soeurs : le film ouvert reste lisible tel quel.
        if (!active) return;
        setVariants([]);
        setActiveId(movie.id);
      });
    return () => {
      active = false;
    };
  }, [movie, preferredLanguage, resumeVariantId]);

  // Complements du panel a la demande (non bloquant, jamais indispensable).
  useEffect(() => {
    // Connexion faible : pas de complements panel (synopsis TMDB en cache suffit).
    if (credentials === null || isLowBandwidth()) return;
    let active = true;
    loadVodExtras(credentials, vodId)
      .then((x) => {
        if (active) setExtras(x);
      })
      .catch(() => {
        // silencieux : le detail reste utilisable sans synopsis
      });
    return () => {
      active = false;
    };
  }, [credentials, vodId]);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);

  return { movie, error, retry, progress, progressLoaded, variants, activeId, selectVariant: setActiveId, extras };
}
