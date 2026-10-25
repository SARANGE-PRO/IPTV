import { useCallback, useEffect, useState } from 'react';
import * as catalogRepository from '@/services/data/catalogService';
import type { LiveChannel } from '@/types/models';

export const LIVE_SEARCH_LIMIT = 120;

/** Recherche de chaines (index multiEntry), categories masquees exclues. */
export function useLiveSearch(query: string, hidden: ReadonlySet<string>) {
  const [results, setResults] = useState<LiveChannel[]>([]);
  const [loading, setLoading] = useState(false);
  /** Lecture en echec : distinct de « aucun resultat ». */
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const active = query.length >= 2;

  useEffect(() => {
    setError(false);
    if (!active) {
      setResults([]);
      return;
    }
    let current = true;
    setLoading(true);
    void catalogRepository
      .searchLiveChannels(query, LIVE_SEARCH_LIMIT, hidden)
      .then((rows) => {
        if (current) setResults(rows);
      })
      .catch(() => {
        if (!current) return;
        setResults([]);
        setError(true);
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [active, query, hidden, attempt]);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);

  return { active, results, loading, error, retry };
}
