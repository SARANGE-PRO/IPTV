'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { DetailModal } from '@/components/shared/DetailModal';
import { EmptyState } from '@/components/shared/EmptyState';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { Button } from '@/components/ui/Button';
import { MovieDetailView } from '@/components/movies/MovieDetailView';
import { SeriesDetailView } from '@/components/series/SeriesDetailView';
import { usePlaybackStore } from '@/stores/playbackStore';
import { usePlayerStore } from '@/stores/playerStore';

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

  // Fiche du titre qui joue deja (mini-lecteur) : elle s'ouvre directement sur
  // le lecteur, sans recharger le flux. Lu UNE fois a l'ouverture.
  const resume = useMemo(() => {
    const media = usePlayerStore.getState().session?.media;
    if (media === undefined) return { vodItemId: null as string | null, episodeId: null as string | null };
    return {
      // Version de langue qui joue (peut differer de la preferee).
      vodItemId: vodId !== null && media.kind === 'vod' && media.ownerId === vodId ? media.itemId : null,
      episodeId: seriesId !== null && media.kind === 'episode' && media.ownerId === seriesId ? media.itemId : null,
    };
  }, [vodId, seriesId]);

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
      <DetailModal key={`vod:${vodId}`} onClose={close}>
        <ErrorBoundary resetKey={vodId} fallback={(reset) => <DetailCrash onRetry={reset} onClose={close} />}>
          <MovieDetailView
            key={vodId}
            vodId={vodId}
            onBack={close}
            autoPlay={autoPlay || resume.vodItemId !== null}
            resumeVariantId={resume.vodItemId}
          />
        </ErrorBoundary>
      </DetailModal>
    );
  }
  if (seriesId !== null) {
    return (
      <DetailModal key={`series:${seriesId}`} onClose={close}>
        <ErrorBoundary resetKey={seriesId} fallback={(reset) => <DetailCrash onRetry={reset} onClose={close} />}>
          <SeriesDetailView
            key={seriesId}
            seriesId={seriesId}
            onBack={close}
            autoPlay={autoPlay || resume.episodeId !== null}
            episodeId={episodeId ?? resume.episodeId}
          />
        </ErrorBoundary>
      </DetailModal>
    );
  }
  return null;
}

/** Fiche plantee : la modale reste ouverte, avec reprise ou fermeture. */
function DetailCrash({ onRetry, onClose }: { onRetry: () => void; onClose: () => void }) {
  return (
    <div className="px-4 pb-10 pt-12 md:px-8">
      <EmptyState
        title="Cette fiche n’a pas pu s’afficher"
        hint="Réessaie — ta lecture en cours et tes données sont intactes."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={onRetry}>Réessayer</Button>
            <Button variant="secondary" onClick={onClose}>
              Fermer
            </Button>
          </div>
        }
      />
    </div>
  );
}
