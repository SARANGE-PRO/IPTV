import { useCallback, useEffect, useState } from 'react';
import { getLineupGroups } from '@/services/live/frenchLineupService';
import { useCatalogStore } from '@/stores/catalogStore';
import { useLiveLineupStore, type LineupStatus } from '@/stores/liveLineupStore';
import type { LineupGroup } from '@/types/liveLineup';

/**
 * Grille FR rangee, prete a afficher. Verifie / reconstruit la grille au
 * montage et apres chaque synchro Live ; les chaines restent hors Zustand
 * (lecture unique memorisee par le service).
 */
export function useLiveLineup(): { status: LineupStatus; groups: LineupGroup[] | null; retry: () => void } {
  const ensure = useLiveLineupStore((s) => s.ensure);
  const status = useLiveLineupStore((s) => s.status);
  const revision = useLiveLineupStore((s) => s.revision);
  const lastFetchAt = useCatalogStore((s) => s.sections.live.lastFetchAt);
  const [groups, setGroups] = useState<LineupGroup[] | null>(null);
  const [readFailed, setReadFailed] = useState(false);

  useEffect(() => {
    void ensure();
  }, [ensure, lastFetchAt]);

  useEffect(() => {
    if (status !== 'ready') return;
    let active = true;
    setReadFailed(false);
    void getLineupGroups()
      .then((list) => {
        if (active) setGroups(list);
      })
      .catch(() => {
        if (active) setReadFailed(true);
      });
    return () => {
      active = false;
    };
  }, [status, revision]);

  const retry = useCallback(() => {
    setReadFailed(false);
    void ensure();
  }, [ensure]);

  return { status: readFailed ? 'error' : status, groups, retry };
}
