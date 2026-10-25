import { useEffect } from 'react';
import { purgeStaleCaches } from '@/services/storage/cacheMaintenanceService';

/** Apres le demarrage (jamais pendant), une fois par lancement : caches perimes purges. */
const DELAY_MS = 20_000;

export function useStorageMaintenance(): void {
  useEffect(() => {
    const timer = setTimeout(() => void purgeStaleCaches(), DELAY_MS);
    return () => clearTimeout(timer);
  }, []);
}
