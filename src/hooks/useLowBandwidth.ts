import { useEffect, useSyncExternalStore } from 'react';
import {
  declineProposal,
  hydrateLowBandwidth,
  isLowBandwidth,
  isProposed,
  setLowBandwidth,
  subscribeLowBandwidth,
} from '@/services/network/lowBandwidthService';

/** Mode « connexion faible » (etat, proposition auto, actions). */
export function useLowBandwidth() {
  const enabled = useSyncExternalStore(subscribeLowBandwidth, isLowBandwidth, () => false);
  const proposed = useSyncExternalStore(subscribeLowBandwidth, isProposed, () => false);
  return { enabled, proposed, setEnabled: setLowBandwidth, decline: declineProposal };
}

/**
 * Demarrage : etat relu (eteint s'il a vieilli). Sortie du mode : les taches
 * interrompues (enrichissement TMDB) repartent ; les autres (synchro, guide,
 * scores) se relancent d'elles-memes.
 */
export function useLowBandwidthLifecycle(resumeBackfill: () => Promise<void>): void {
  useEffect(() => {
    void hydrateLowBandwidth();
    return subscribeLowBandwidth(() => {
      if (!isLowBandwidth()) void resumeBackfill();
    });
  }, [resumeBackfill]);
}
