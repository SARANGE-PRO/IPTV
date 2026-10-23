import { useEffect, useState } from 'react';
import { getLineupLogos } from '@/services/live/frenchLineupService';
import { useLiveLineupStore } from '@/stores/liveLineupStore';

/** Logos de la grille FR (toutes versions, meilleur d'abord) ; absents = hors grille. */
export function useLineupLogos(ids: string[]): Map<string, string[]> {
  const [logos, setLogos] = useState<Map<string, string[]>>(() => new Map());
  const revision = useLiveLineupStore((s) => s.revision);
  const key = ids.join(',');

  useEffect(() => {
    if (key === '') return;
    let active = true;
    void getLineupLogos(key.split(','))
      .then((map) => {
        if (active) setLogos(map);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [key, revision]);

  return logos;
}
