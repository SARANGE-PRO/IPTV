'use client';

import { useEffect, useRef } from 'react';
import {
  applyNowPlaying,
  clearNowPlaying,
  type NowPlayingActions,
  type NowPlayingMeta,
} from '@/services/player/mediaSessionService';

/**
 * Publie « ce qui joue » (titre, episode, affiche, bouton suivant) sur l'ecran
 * verrouille / Centre de controle tant que `meta` est non nul. Re-applique a
 * chaque evenement `playing` de la page (iOS reinitialise les metadonnees au
 * chargement d'un nouveau flux) — ecoute en CAPTURE sur le document, donc
 * independante du composant lecteur.
 */
export function useMediaSession(meta: NowPlayingMeta | null, actions: NowPlayingActions = {}): void {
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  const hasNext = actions.onNext != null;
  const hasPrevious = actions.onPrevious != null;
  const title = meta?.title ?? null;
  const subtitle = meta?.subtitle ?? null;
  const artwork = meta?.artwork ?? null;

  useEffect(() => {
    if (title === null) return;
    const apply = () =>
      applyNowPlaying(
        { title, subtitle, artwork },
        {
          onNext: hasNext ? () => actionsRef.current.onNext?.() : null,
          onPrevious: hasPrevious ? () => actionsRef.current.onPrevious?.() : null,
        },
      );
    apply();
    document.addEventListener('playing', apply, true);
    return () => {
      document.removeEventListener('playing', apply, true);
      clearNowPlaying();
    };
  }, [title, subtitle, artwork, hasNext, hasPrevious]);
}
