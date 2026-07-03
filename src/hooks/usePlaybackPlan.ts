'use client';

import { useEffect, useState } from 'react';
import {
  isGatewayConfigured,
  isGatewayHealthy,
  resetGatewayHealthCache,
} from '@/services/player/mediaGatewayService';
import { classifyContainer } from '@/utils/playerSupport';

/**
 * Comment lire un VOD / episode sur l'appareil courant :
 *  - 'direct'   : conteneur natif (MP4/MOV) -> lecture in-app sans passerelle.
 *  - 'gateway'  : conteneur non-natif (MKV/AVI) MAIS passerelle joignable
 *                 -> transcodage in-app.
 *  - 'vlc-only' : conteneur non-natif ET pas de passerelle joignable
 *                 -> seul VLC (natif) peut le lire.
 *  - 'checking' : sonde de la passerelle en cours (bref).
 */
export type PlaybackMode = 'direct' | 'gateway' | 'vlc-only' | 'checking';

/**
 * `retryToken` : incremente-le (depuis la page, sur echec de lecture ou via un
 * bouton "reessayer") pour FORCER une nouvelle sonde de la passerelle. Sans ca,
 * un premier verdict `vlc-only` (PC endormi au montage) resterait fige toute la
 * vie du composant, meme apres reveil de la passerelle.
 */
export function usePlaybackPlan(
  containerExtension: string | null | undefined,
  retryToken = 0,
): PlaybackMode {
  const support = classifyContainer(containerExtension);
  const [mode, setMode] = useState<PlaybackMode>(support === 'transcode' ? 'checking' : 'direct');

  useEffect(() => {
    // Conteneur natif (ou inconnu -> tentative directe) : lisible in-app.
    if (support !== 'transcode') {
      setMode('direct');
      return;
    }
    // Non-natif sans passerelle configuree : inutile de sonder, VLC direct.
    if (!isGatewayConfigured()) {
      setMode('vlc-only');
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
  }, [support, retryToken]);

  return mode;
}
