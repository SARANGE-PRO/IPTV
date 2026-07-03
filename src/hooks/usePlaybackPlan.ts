'use client';

import { useEffect, useState } from 'react';
import { isGatewayConfigured, isGatewayHealthy } from '@/services/player/mediaGatewayService';
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

export function usePlaybackPlan(containerExtension: string | null | undefined): PlaybackMode {
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
    void isGatewayHealthy().then((ok) => {
      if (active) setMode(ok ? 'gateway' : 'vlc-only');
    });
    return () => {
      active = false;
    };
  }, [support]);

  return mode;
}
