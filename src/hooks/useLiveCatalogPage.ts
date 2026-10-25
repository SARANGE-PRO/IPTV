import { useCallback, useEffect, useRef, useState } from 'react';
import * as catalogRepository from '@/services/data/catalogService';
import type { LiveFilter } from '@/services/data/catalogService';
import type { LiveChannel } from '@/types/models';

const PAGE = 200;

/**
 * International / Tous : pagination Dexie (jamais les 55k en memoire), ordre
 * fournisseur, categories masquees exclues. `filter` null = inactif.
 * `error` : premiere page illisible (la page propose « Reessayer ») ; une page
 * SUIVANTE en echec s'arrete simplement la, sans effacer ce qui est affiche.
 */
export function useLiveCatalogPage(filter: LiveFilter | null, hidden: ReadonlySet<string>) {
  const [channels, setChannels] = useState<LiveChannel[]>([]);
  const [count, setCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const offsetRef = useRef(0);
  const busyRef = useRef(false);
  const kind = filter?.kind ?? null;

  useEffect(() => {
    setChannels([]);
    setCount(null);
    setExhausted(false);
    setError(false);
    offsetRef.current = 0;
    if (filter === null) return;
    let active = true;
    setLoading(true);
    busyRef.current = true;
    void Promise.all([
      catalogRepository.getLiveChannelsPage(filter, 0, PAGE),
      catalogRepository.countLiveChannels(filter),
    ])
      .then(([page, total]) => {
        if (!active) return;
        offsetRef.current = PAGE;
        setExhausted(page.length < PAGE);
        setChannels(page.filter((c) => !hidden.has(c.categoryId)));
        setCount(total);
      })
      .catch(() => {
        if (!active) return;
        setExhausted(true);
        setError(true);
      })
      .finally(() => {
        busyRef.current = false;
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
    // `filter` est recree a chaque rendu : seul son genre compte.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, hidden, attempt]);

  const loadMore = useCallback(() => {
    if (filter === null || exhausted || busyRef.current) return;
    busyRef.current = true;
    const offset = offsetRef.current;
    void catalogRepository
      .getLiveChannelsPage(filter, offset, PAGE)
      .then((page) => {
        offsetRef.current = offset + PAGE;
        setExhausted(page.length < PAGE);
        setChannels((prev) => [...prev, ...page.filter((c) => !hidden.has(c.categoryId))]);
      })
      .catch(() => setExhausted(true))
      .finally(() => {
        busyRef.current = false;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, exhausted, hidden]);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);

  return { channels, count, loading, exhausted, error, loadMore, retry };
}
