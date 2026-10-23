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
      const times = SECTIONS.map((s) => sections[s].lastFetchAt);
      if (times.every((t) => t === null)) return;
      const oldest = Math.min(...times.map((t) => t ?? 0));
      if (Date.now() - oldest >= CATALOG_AUTO_SYNC_MS) void sync(credentials, { quiet: true });
    };
    check();
    document.addEventListener('visibilitychange', check);
    return () => document.removeEventListener('visibilitychange', check);
  }, [credentials, hydrated]);
}
