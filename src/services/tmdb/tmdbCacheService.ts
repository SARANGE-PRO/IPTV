import { CACHE_TTL } from '@/config/constants';
import * as tmdbRepository from '@/db/repositories/tmdbRepository';
import type { TmdbMetadata } from '@/types/models';
import { enrichByTmdbId, enrichMovie, enrichSeries, tmdbCacheKey } from './tmdbMatcher';

/**
 * Enrichissement TMDB A LA DEMANDE, jamais massif. Resultats (y compris
 * "introuvable") caches longuement dans Dexie pour eviter les re-requetes.
 * Ne jette jamais : renvoie null si TMDB indisponible (l'UI reste utilisable
 * avec les seules donnees Xtream).
 */

const NEGATIVE_RETRY_MS = 1000 * 60 * 60 * 24 * 3; // reessai 'notfound' apres 3 j
const inFlight = new Map<string, Promise<TmdbMetadata | null>>();

async function fetchAndCache(
  key: string,
  type: 'movie' | 'tv',
  rawName: string,
  year: number | null,
  enricher: (name: string, year: number | null) => Promise<TmdbMetadata | null>,
  stale: TmdbMetadata | null,
): Promise<TmdbMetadata | null> {
  try {
    const data = await enricher(rawName, year);
    await tmdbRepository.putTmdbEntry({
      key,
      type,
      status: data !== null ? 'found' : 'notfound',
      data,
      fetchedAt: Date.now(),
    });
    return data;
  } catch {
    return stale;
  } finally {
    inFlight.delete(key);
  }
}

/** Complete une entree partielle par son id TMDB (dedoublonne en vol ; repli = la version partielle). */
function completePartial(key: string, type: 'movie' | 'tv', partial: TmdbMetadata): Promise<TmdbMetadata | null> {
  const pending = inFlight.get(key);
  if (pending !== undefined) return pending;
  const request = (async (): Promise<TmdbMetadata | null> => {
    try {
      const full = await enrichByTmdbId(type, partial.tmdbId);
      if (full === null) {
        // Detail introuvable : on fige l'entree (plus de nouvelle tentative a chaque ouverture).
        const frozen: TmdbMetadata = { ...partial, trailerKey: partial.trailerKey ?? null, collection: partial.collection ?? null };
        await tmdbRepository.putTmdbEntry({ key, type, status: 'found', data: frozen, fetchedAt: Date.now(), partial: false });
        return frozen;
      }
      await tmdbRepository.putTmdbEntry({ key, type, status: 'found', data: full, fetchedAt: Date.now(), partial: false });
      return full;
    } catch {
      return partial;
    } finally {
      inFlight.delete(key);
    }
  })();
  inFlight.set(key, request);
  return request;
}

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
    if (cached.status === 'found' && age < CACHE_TTL.tmdb) {
      // Entree issue du backfill allege (recherche seule) : la fiche a besoin du
      // casting / de la duree -> UNE requete detail par id, puis cache complet.
      // Idem pour une entree d'avant P5 (sans `trailerKey`/`collection`) : un
      // seul appel par id, puis cache complet.
      if (cached.data !== null && (cached.partial === true || cached.data.trailerKey === undefined)) {
        return completePartial(key, type, cached.data);
      }
      return cached.data;
    }
    if (cached.status === 'notfound' && age < NEGATIVE_RETRY_MS) return null;
  }

  const pending = inFlight.get(key);
  if (pending !== undefined) return pending;

  const request = fetchAndCache(key, type, rawName, year, enricher, cached?.data ?? null);
  inFlight.set(key, request);
  return request;
}

export function getMovieMetadata(rawName: string, year: number | null): Promise<TmdbMetadata | null> {
  return getOrFetch('movie', rawName, year, enrichMovie);
}

export function getSeriesMetadata(rawName: string, year: number | null): Promise<TmdbMetadata | null> {
  return getOrFetch('tv', rawName, year, enrichSeries);
}
