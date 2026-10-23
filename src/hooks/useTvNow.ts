import { useCallback, useEffect, useState } from 'react';
import { getCachedTvSchedule, refreshTvSchedule } from '@/services/epg/tvGuideService';
import type { TvNow, TvSchedule } from '@/types/tvGuide';
import { tvNowFor } from '@/utils/tvNow';

/** Guide en construction cote serveur : nouvel essai apres ce delai. */
const RETRY_MS = 20_000;
const TICK_MS = 60_000;

/**
 * Programme en cours par chaine (nom du referentiel FR) pour la liste Live.
 * Recalcule chaque minute ; guide rafraichi au plus toutes les 30 min.
 */
export function useTvNow(): { nowFor: (name: string) => TvNow | null; nowMs: number } {
  const [schedule, setSchedule] = useState<TvSchedule | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    void getCachedTvSchedule().then((s) => {
      if (active && s !== null) setSchedule(s);
    });
    const load = (attempt: number) => {
      void refreshTvSchedule().then(({ schedule: s, loading }) => {
        if (!active) return;
        if (s !== null) setSchedule(s);
        if (loading && attempt < 3) timer = setTimeout(() => load(attempt + 1), RETRY_MS);
      });
    };
    load(0);
    const tick = setInterval(() => {
      setNowMs(Date.now());
      load(0); // sans effet tant que le guide a moins de 30 min
    }, TICK_MS);
    return () => {
      active = false;
      if (timer !== null) clearTimeout(timer);
      clearInterval(tick);
    };
  }, []);

  const nowFor = useCallback(
    (name: string) => (schedule !== null ? tvNowFor(schedule.channels[name], nowMs) : null),
    [schedule, nowMs],
  );
  return { nowFor, nowMs };
}
