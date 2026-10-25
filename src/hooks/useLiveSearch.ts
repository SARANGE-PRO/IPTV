import { useCallback, useEffect, useRef, useState } from 'react';
import * as catalogRepository from '@/services/data/catalogService';
import type { LiveChannel } from '@/types/models';

/** Chaines chargees par page (les identifiants, eux, sont tous connus d'emblee). */
const PAGE = 100;

/**
 * Recherche de chaines COMPLETE : tous les resultats (un prefixe fournisseur
 * « XYZ: » de 500 chaines les donne tous), charges par pages au defilement.
 * 1) identifiants ordonnes (index de recherche, leger) ; 2) chaines par
 * paquets de 100. Une recherche depassee par la frappe suivante est ignoree.
 */
export function useLiveSearch(query: string, hidden: ReadonlySet<string>) {
  const [ids, setIds] = useState<string[]>([]);
  const [capped, setCapped] = useState(false);
  const [results, setResults] = useState<LiveChannel[]>([]);
  const [loading, setLoading] = useState(false);
  /** Lecture en echec : distinct de « aucun resultat ». */
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const generation = useRef(0);
  const busy = useRef(false);
  const active = query.length >= 2;

  useEffect(() => {
    const gen = ++generation.current;
    setError(false);
    setIds([]);
    setCapped(false);
    if (!active) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    busy.current = true;
    void (async () => {
      try {
        const found = await catalogRepository.findLiveChannelIds(query, hidden);
        const first = await catalogRepository.getLiveChannelsByIds(found.ids.slice(0, PAGE));
        if (gen !== generation.current) return;
        setIds(found.ids);
        setCapped(found.capped);
        setResults(first);
      } catch {
        if (gen !== generation.current) return;
        setResults([]);
        setError(true);
      } finally {
        if (gen === generation.current) {
          busy.current = false;
          setLoading(false);
        }
      }
    })();
  }, [active, query, hidden, attempt]);

  const canLoadMore = results.length < ids.length;
  const loadMore = useCallback(() => {
    if (busy.current || results.length >= ids.length) return;
    busy.current = true;
    const gen = generation.current;
    void catalogRepository
      .getLiveChannelsByIds(ids.slice(results.length, results.length + PAGE))
      .then((page) => {
        if (gen === generation.current) setResults((prev) => [...prev, ...page]);
      })
      .catch(() => undefined)
      .finally(() => {
        if (gen === generation.current) busy.current = false;
      });
  }, [ids, results.length]);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);

  return { active, results, loading, error, retry, total: ids.length, capped, canLoadMore, loadMore };
}
