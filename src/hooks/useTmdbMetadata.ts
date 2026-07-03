import { useEffect, useState } from 'react';
import { getMovieMetadata, getSeriesMetadata } from '@/services/tmdb/tmdbCacheService';
import type { TmdbMetadata } from '@/types/models';

/**
 * Enrichissement TMDB non bloquant pour une page detail. `name` null tant que
 * l'item Xtream n'est pas charge -> aucun appel. Ne fait jamais echouer l'UI.
 */
export function useTmdbMetadata(
  kind: 'movie' | 'series',
  name: string | null,
  year: number | null,
): TmdbMetadata | null {
  const [meta, setMeta] = useState<TmdbMetadata | null>(null);

  useEffect(() => {
    setMeta(null);
    if (name === null || name === '') return;
    let active = true;
    const fetcher = kind === 'movie' ? getMovieMetadata : getSeriesMetadata;
    void fetcher(name, year).then((m) => {
      if (active) setMeta(m);
    });
    return () => {
      active = false;
    };
  }, [kind, name, year]);

  return meta;
}
