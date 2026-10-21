'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef } from 'react';
import { DetailModal } from '@/components/shared/DetailModal';
import { MovieDetailView } from '@/components/movies/MovieDetailView';
import { SeriesDetailView } from '@/components/series/SeriesDetailView';
import { usePlaybackStore } from '@/stores/playbackStore';

/**
 * Ouvre le detail film/serie en MODAL des que l'URL porte `?vod=<id>` ou
 * `?series=<id>` (liens construits par utils/appRoutes), sur n'importe quelle
 * page du groupe (app). Remplace les intercepting routes : zero route
 * dynamique -> export statique possible.
 *
 * Fermeture : `router.back()` quand le modal a ete ouvert par navigation
 * (depile l'entree d'historique) ; `router.replace(pathname)` en ACCES DIRECT
 * (URL tapee, rechargement, lien partage) ou il n'y a rien a depiler.
 *
 * Doit etre rendu sous <Suspense> : useSearchParams l'exige au prerendu.
 */
export function DetailModalHost() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const vodId = searchParams.get('vod');
  const seriesId = searchParams.get('series');
  // `?play=1` (+ `&ep=`) : lecture directe depuis l'accueil (billboard, Continuer).
  const autoPlay = searchParams.get('play') === '1';
  const episodeId = searchParams.get('ep');
  const open = vodId !== null || seriesId !== null;

  // Vrai tant que le modal courant est celui present au montage (acces direct).
  const directAccessRef = useRef(open);
  useEffect(() => {
    if (!open) directAccessRef.current = false;
  }, [open]);

  // Fermeture d'une fiche : la page dessous (accueil…) est restee montee ->
  // on rafraichit « Continuer a regarder » avec la progression qui vient d'etre jouee.
  const wasOpenRef = useRef(open);
  useEffect(() => {
    if (wasOpenRef.current && !open) void usePlaybackStore.getState().hydrateRails();
    wasOpenRef.current = open;
  }, [open]);

  const close = useCallback(() => {
    if (directAccessRef.current) router.replace(pathname);
    else router.back();
  }, [router, pathname]);

  if (vodId !== null) {
    return (
      <DetailModal onClose={close}>
        <MovieDetailView key={vodId} vodId={vodId} onBack={close} autoPlay={autoPlay} />
      </DetailModal>
    );
  }
  if (seriesId !== null) {
    return (
      <DetailModal onClose={close}>
        <SeriesDetailView
          key={seriesId}
          seriesId={seriesId}
          onBack={close}
          autoPlay={autoPlay}
          episodeId={episodeId}
        />
      </DetailModal>
    );
  }
  return null;
}
