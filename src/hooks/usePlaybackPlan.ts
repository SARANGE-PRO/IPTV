'use client';

import { useEffect, useState } from 'react';
import { isGatewayHealthy, resetGatewayHealthCache } from '@/services/player/mediaGatewayService';
import { immediatePlaybackMode, type ResolvedPlaybackMode } from '@/services/player/playbackPlanService';

/**
 * Plan de lecture d'un VOD / episode (voir services/player/playbackPlanService) ;
 * 'checking' : sonde de la passerelle en cours (bref).
 */
export type PlaybackMode = ResolvedPlaybackMode | 'checking';

export interface PlaybackPlanOptions {
  /** Faux apres un echec du remux direct (codecs non lus, CORS…) : on retombe sur passerelle/VLC. */
  directMkvAllowed?: boolean;
}

/**
 * `retryToken` : incremente-le (depuis la page, sur echec de lecture ou via un
 * bouton "reessayer") pour FORCER une nouvelle sonde de la passerelle. Sans ca,
 * un premier verdict `vlc-only` (PC endormi au montage) resterait fige toute la
 * vie du composant, meme apres reveil de la passerelle.
 */
export function usePlaybackPlan(
  containerExtension: string | null | undefined,
  retryToken = 0,
  options: PlaybackPlanOptions = {},
): PlaybackMode {
  const directMkvAllowed = options.directMkvAllowed !== false;
  const initial = immediatePlaybackMode(containerExtension, directMkvAllowed);
  const [mode, setMode] = useState<PlaybackMode>(initial === 'probe' ? 'checking' : initial);

  useEffect(() => {
    const immediate = immediatePlaybackMode(containerExtension, directMkvAllowed);
    if (immediate !== 'probe') {
      setMode(immediate);
      return;
    }
    let active = true;
    setMode('checking');
    // Sur un retry explicite, on invalide le cache 30 s pour re-sonder l'etat reel.
    if (retryToken > 0) resetGatewayHealthCache();
    void isGatewayHealthy().then((ok) => {
      if (active) setMode(ok ? 'gateway' : 'vlc-only');
    });
    return () => {
      active = false;
    };
  }, [containerExtension, directMkvAllowed, retryToken]);

  return mode;
}
