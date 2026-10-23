import { useEffect, useState } from 'react';
import { getLineupEntries } from '@/services/live/frenchLineupService';
import { useLiveLineupStore } from '@/stores/liveLineupStore';

/** Noms de la grille FR (« beIN Sports 1 ») pour des flux donnes ; absents = hors grille. */
export function useLineupNames(ids: string[]): Map<string, string> {
  const [names, setNames] = useState<Map<string, string>>(() => new Map());
  const revision = useLiveLineupStore((s) => s.revision);
  const key = ids.join(',');

  useEffect(() => {
    if (key === '') return;
    let active = true;
    void getLineupEntries(key.split(','))
      .then((entries) => {
        if (!active) return;
        setNames(new Map(entries.flatMap((e) => (e !== undefined ? [[e.id, e.name] as const] : []))));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [key, revision]);

  return names;
}
