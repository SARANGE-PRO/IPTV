import { CACHE_TTL } from '@/config/constants';
import * as tmdbRepository from '@/db/repositories/tmdbRepository';
import type { TmdbMetadata } from '@/types/models';
import { enrichMovie, enrichSeries, tmdbCacheKey } from './tmdbMatcher';

/**
 * Enrichissement TMDB A LA DEMANDE, jamais massif. Resultats (y compris
 * "introuvable") caches longuement dans Dexie pour eviter les re-requetes.
 * Ne jette jamais : renvoie null si TMDB indisponible (l'UI reste utilisable
 * avec les seules donnees Xtream).
 */

const NEGATIVE_RETRY_MS = 1000 * 60 * 60 * 24 * 3; // reessai 'notfound' apres 3 j

async function getOrFetch(
  type: 'movie' | 'tv',
  rawName: string,
  year: number | null,
  enricher: (name: string, year: number | null) => Promise<TmdbMetadata | null>,
): Promise<TmdbMetadata | null> {
  const key = tmdbCacheKey(type, rawName);
  const cached = await tmdbRepository.getTmdbEntry(key);
  if (cached !== undefined) {
    const age = Date.now() - cached.fetchedAt;
    if (cached.status === 'found' && age < CACHE_TTL.tmdb) return cached.data;
    if (cached.status === 'notfound' && age < NEGATIVE_RETRY_MS) return null;
  }

  let data: TmdbMetadata | null;
  try {
    data = await enricher(rawName, year);
  } catch {
    // Reseau/TMDB KO : renvoyer un cache perime si present, sinon null.
    return cached?.data ?? null;
  }

  await tmdbRepository.putTmdbEntry({
    key,
    type,
    status: data !== null ? 'found' : 'notfound',
    data,
    fetchedAt: Date.now(),
  });
  return data;
}

export function getMovieMetadata(rawName: string, year: number | null): Promise<TmdbMetadata | null> {
  return getOrFetch('movie', rawName, year, enrichMovie);
}

export function getSeriesMetadata(rawName: string, year: number | null): Promise<TmdbMetadata | null> {
  return getOrFetch('tv', rawName, year, enrichSeries);
}
