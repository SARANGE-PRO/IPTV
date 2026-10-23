import { useEffect, useRef, useState } from 'react';
import { getNewEpisodes, refreshNewEpisodes, type NewEpisodesItem } from '@/services/home/newEpisodesService';
import { useAuthStore } from '@/stores/authStore';
import { useCatalogStore } from '@/stores/catalogStore';

/** Une verification au lancement de l'app, puis apres chaque synchro. */
let checkedThisSession = false;

/** Rangee « Nouveaux episodes » de l'accueil (series suivies). */
export function useNewEpisodes(): NewEpisodesItem[] {
  const credentials = useAuthStore((s) => s.credentials);
  const syncing = useCatalogStore((s) => s.syncing);
  const [items, setItems] = useState<NewEpisodesItem[]>([]);
  const wasSyncing = useRef(syncing);

  useEffect(() => {
    let active = true;
    const load = () =>
      void getNewEpisodes()
        .then((list) => {
          if (active) setItems(list);
        })
        .catch(() => undefined);
    load();
    const syncJustEnded = wasSyncing.current && !syncing;
    wasSyncing.current = syncing;
    if (credentials !== null && !syncing && (syncJustEnded || !checkedThisSession)) {
      checkedThisSession = true;
      void refreshNewEpisodes(credentials).then(load);
    }
    return () => {
      active = false;
    };
  }, [credentials, syncing]);

  return items;
}
