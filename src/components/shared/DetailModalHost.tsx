'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef } from 'react';
import { DetailModal } from '@/components/shared/DetailModal';
import { MovieDetailView } from '@/components/movies/MovieDetailView';
import { SeriesDetailView } from '@/components/series/SeriesDetailView';

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
  const open = vodId !== null || seriesId !== null;

  // Vrai tant que le modal courant est celui present au montage (acces direct).
  const directAccessRef = useRef(open);
  useEffect(() => {
    if (!open) directAccessRef.current = false;
  }, [open]);

  const close = useCallback(() => {
    if (directAccessRef.current) router.replace(pathname);
    else router.back();
  }, [router, pathname]);

  if (vodId !== null) {
    return (
      <DetailModal onClose={close}>
        <MovieDetailView vodId={vodId} onBack={close} />
      </DetailModal>
    );
  }
  if (seriesId !== null) {
    return (
      <DetailModal onClose={close}>
        <SeriesDetailView seriesId={seriesId} onBack={close} />
      </DetailModal>
    );
  }
  return null;
}
