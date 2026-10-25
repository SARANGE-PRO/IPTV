import { useCallback } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useCatalogStore } from '@/stores/catalogStore';

/**
 * Synchro manuelle du catalogue (etats vides « Catalogue non synchronise ») et
 * drapeau `hydrated` : tant que le catalogue local n'est pas relu, une section
 * vide n'est PAS encore un catalogue absent (pas de faux etat vide au demarrage).
 */
export function useCatalogSync() {
  const credentials = useAuthStore((s) => s.credentials);
  const syncing = useCatalogStore((s) => s.syncing);
  const hydrated = useCatalogStore((s) => s.hydrated);
  const sync = useCatalogStore((s) => s.sync);

  const syncNow = useCallback(() => {
    if (credentials !== null) void sync(credentials, { force: true });
  }, [credentials, sync]);

  return { hydrated, syncing, canSync: credentials !== null && !syncing, syncNow };
}
