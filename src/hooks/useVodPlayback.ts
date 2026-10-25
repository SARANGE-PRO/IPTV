'use client';

import { useCallback, useState } from 'react';
import { usePlaybackPlan } from '@/hooks/usePlaybackPlan';
import { resetGatewayHealthCache } from '@/services/player/mediaGatewayService';

/**
 * Etat de lecture commun aux fiches film et serie : plan de lecture (direct,
 * MKV direct, passerelle, VLC), relance de la sonde passerelle, repli apres un
 * echec du remux MKV direct, echec definitif signale par le lecteur.
 */
export function useVodPlayback(containerExtension: string | null | undefined) {
  const [failed, setFailed] = useState(false);
  // Incremente -> re-sonde la passerelle (echec de lecture ou reveil du PC).
  const [planRetry, setPlanRetry] = useState(0);
  // Echec du remux MKV direct (codecs/CORS/MSE) : on retombe sur passerelle/VLC.
  const [directMkvFailed, setDirectMkvFailed] = useState(false);
  const plan = usePlaybackPlan(containerExtension, planRetry, { directMkvAllowed: !directMkvFailed });

  const retryGateway = useCallback(() => setPlanRetry((n) => n + 1), []);
  const markDirectMkvFailed = useCallback(() => setDirectMkvFailed(true), []);
  const clearFailed = useCallback(() => setFailed(false), []);
  const markFailed = useCallback(() => {
    setFailed(true);
    // Invalide le cache sante : une eventuelle passerelle morte sera re-sondee
    // au prochain essai (bouton, replay), sans boucler ici.
    resetGatewayHealthCache();
  }, []);

  return { plan, failed, retryGateway, markDirectMkvFailed, markFailed, clearFailed };
}
