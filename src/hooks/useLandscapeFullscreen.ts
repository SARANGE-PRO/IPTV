'use client';

import { useEffect, useState } from 'react';
import {
  enterVideoFullscreen,
  exitVideoFullscreen,
  isVideoFullscreen,
  PHONE_LANDSCAPE_QUERY,
} from '@/utils/videoFullscreen';

export interface LandscapeFullscreenState {
  /** Telephone a l'horizontale. */
  landscape: boolean;
  /** La video est dans le lecteur plein ecran natif. */
  fullscreen: boolean;
}

/** Evenements de plein ecran (WebKit iPhone + standard). */
const FULLSCREEN_EVENTS = ['webkitbeginfullscreen', 'webkitendfullscreen', 'fullscreenchange'] as const;

/**
 * Telephone a l'horizontale : le 1er tap sur la video ouvre le lecteur plein
 * ecran NATIF (iOS refuse de l'ouvrir sans geste, donc pas des la rotation).
 * Retour a la verticale : on en sort automatiquement (permis sans geste).
 * Le plein ecran CSS de la page couvre l'ecran en attendant le tap.
 */
export function useLandscapeFullscreen(video: HTMLVideoElement | null): LandscapeFullscreenState {
  const [landscape, setLandscape] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    if (video === null || typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(PHONE_LANDSCAPE_QUERY);

    const syncFullscreen = () => setFullscreen(isVideoFullscreen(video));
    const onOrientation = () => {
      setLandscape(query.matches);
      if (!query.matches) exitVideoFullscreen(video);
    };
    // touchend ET click : selon la version d'iOS, le tap sur une <video> avec
    // controles natifs ne remonte pas toujours un click. Double appel sans
    // effet (garde isVideoFullscreen).
    const onTap = () => {
      if (query.matches) enterVideoFullscreen(video);
    };

    onOrientation();
    syncFullscreen();
    query.addEventListener('change', onOrientation);
    video.addEventListener('touchend', onTap);
    video.addEventListener('click', onTap);
    for (const name of FULLSCREEN_EVENTS) {
      (name === 'fullscreenchange' ? document : video).addEventListener(name, syncFullscreen);
    }
    return () => {
      query.removeEventListener('change', onOrientation);
      video.removeEventListener('touchend', onTap);
      video.removeEventListener('click', onTap);
      for (const name of FULLSCREEN_EVENTS) {
        (name === 'fullscreenchange' ? document : video).removeEventListener(name, syncFullscreen);
      }
    };
  }, [video]);

  return { landscape, fullscreen };
}
