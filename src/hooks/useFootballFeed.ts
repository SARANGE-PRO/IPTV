'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { bouquetAvailability, isLive, loadFootballFeed } from '@/services/football/footballService';
import type { ChannelRef } from '@/services/football/channelIndex';
import { useFootballStore } from '@/stores/footballStore';
import type { FootballMatch, GuideStatus } from '@/types/football';
import { isLowBandwidth, subscribeLowBandwidth } from '@/services/network/lowBandwidthService';

/**
 * Flux foot des competitions suivies, rafraichi automatiquement :
 *  - 30 s s'il y a un match en direct, 2 min sinon, 20 s tant que le guide
 *    TV se construit cote serveur ;
 *  - en pause quand l'app est en arriere-plan, rafraichi au retour.
 * Fournit aussi la disponibilite des chaines dans le bouquet (pastilles).
 */

const LIVE_MS = 30_000;
const IDLE_MS = 120_000;
const GUIDE_LOADING_MS = 20_000;

export interface FootballFeedState {
  matches: FootballMatch[];
  guide: GuideStatus;
  failed: string[];
  loading: boolean;
  error: boolean;
  /** Nom de chaine TV -> chaine du bouquet (null = absente). */
  bouquet: Map<string, ChannelRef | null>;
  refresh: () => void;
}

export function useFootballFeed(): FootballFeedState {
  const hydrated = useFootballStore((s) => s.hydrated);
  const hydrate = useFootballStore((s) => s.hydrate);
  const competitions = useFootballStore((s) => s.competitions);
  const [matches, setMatches] = useState<FootballMatch[]>([]);
  const [guide, setGuide] = useState<GuideStatus>('loading');
  const [failed, setFailed] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [bouquet, setBouquet] = useState<Map<string, ChannelRef | null>>(new Map());
  const [tick, setTick] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!hydrated) void hydrate();
  }, [hydrated, hydrate]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!hydrated) return;
    let alive = true;
    const run = async () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      // Connexion faible : derniers scores gardes, pas de requete (reprise a la sortie du mode).
      if (isLowBandwidth()) {
        setLoading(false);
        schedule(IDLE_MS);
        return;
      }
      const feed = await loadFootballFeed(competitions);
      if (!alive) return;
      setLoading(false);
      if (feed === null) {
        setError(true);
        schedule(IDLE_MS);
        return;
      }
      setError(false);
      setMatches(feed.matches);
      setGuide(feed.guide);
      setFailed(feed.failed);
      void bouquetAvailability(feed.matches).then((map) => {
        if (alive) setBouquet(map);
      });
      schedule(feed.guide === 'loading' ? GUIDE_LOADING_MS : feed.matches.some(isLive) ? LIVE_MS : IDLE_MS);
    };
    const schedule = (ms: number) => {
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = setTimeout(() => void run(), ms);
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') void run();
    };
    void run();
    document.addEventListener('visibilitychange', onVisible);
    const offLow = subscribeLowBandwidth(() => {
      if (!isLowBandwidth()) void run();
    });
    return () => {
      offLow();
      alive = false;
      if (timer.current !== null) clearTimeout(timer.current);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [hydrated, competitions, tick]);

  return { matches, guide, failed, loading, error, bouquet, refresh };
}
