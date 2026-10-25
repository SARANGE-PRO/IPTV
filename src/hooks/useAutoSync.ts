import { useEffect } from 'react';
import { CATALOG_AUTO_SYNC_MS } from '@/config/constants';
import { useAuthStore } from '@/stores/authStore';
import { useCatalogStore } from '@/stores/catalogStore';
import { usePlayerStore } from '@/stores/playerStore';
import type { Section } from '@/types/models';

const SECTIONS: Section[] = ['live', 'vod', 'series'];

/**
 * Synchro automatique en douceur : au lancement et au retour dans l'app, si
 * une section du catalogue a plus de 7 jours, resynchronisation de fond
 * (banniere reduite), jamais pendant une lecture. Jamais de premiere synchro ici : elle reste un choix
 * explicite (accueil, reglages).
 */
/** Ecart minimal entre deux synchros de fond (succes ou echec). */
const AUTO_RETRY_MS = 6 * 60 * 60 * 1000;
let lastAutoAttempt = 0;

export function useAutoSync(): void {
  const credentials = useAuthStore((s) => s.credentials);
  const hydrated = useCatalogStore((s) => s.hydrated);

  useEffect(() => {
    if (credentials === null || !hydrated) return;
    const check = () => {
      if (document.visibilityState !== 'visible') return;
      const { sections, syncing, sync } = useCatalogStore.getState();
      // Pas pendant une lecture (ecritures lourdes) : au prochain retour dans l'app.
      if (syncing || usePlayerStore.getState().session !== null) return;
      // Sections deja synchronisees seulement : une section qui n'a JAMAIS
      // reussi (null) comptait comme datee de 0 -> resynchro a chaque retour.
      const times = SECTIONS.map((s) => sections[s].lastFetchAt).filter((t): t is number => t !== null);
      if (times.length === 0) return;
      const now = Date.now();
      // Une synchro de fond qui echoue (serveur coupe) ne se relance pas en boucle.
      if (now - lastAutoAttempt < AUTO_RETRY_MS) return;
      if (now - Math.min(...times) >= CATALOG_AUTO_SYNC_MS) {
        lastAutoAttempt = now;
        void sync(credentials, { quiet: true });
      }
    };
    check();
    document.addEventListener('visibilitychange', check);
    return () => document.removeEventListener('visibilitychange', check);
  }, [credentials, hydrated]);
}
