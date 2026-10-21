import * as catalogRepository from '@/db/repositories/catalogRepository';
import * as settingsRepository from '@/db/repositories/settingsRepository';
import { collectionDetail, type TmdbCollectionPartRaw } from '@/services/tmdb/tmdbClient';
import type { Movie } from '@/types/models';
import { displayYear } from '@/utils/displayTitle';
import { vodKeysMatch, vodMatchKey } from '@/utils/vodMatchKey';

/**
 * SAGA d'un film (collection TMDB : « Dune », « Harry Potter »…), limitee aux
 * episodes PRESENTS dans le catalogue, dans l'ordre de sortie. Liste des
 * parties cachee 30 j (table settings) ; correspondance par id TMDB (groupe
 * `t:<id>`, fiable) puis, a defaut, par titre + annee.
 */

const TTL_MS = 30 * 24 * 60 * 60 * 1000;

interface CachedCollection {
  fetchedAt: number;
  name: string;
  parts: { id: number; title: string; year: number | null }[];
}

export interface CollectionEntry {
  movie: Movie;
  year: number | null;
}

export interface CollectionResult {
  name: string;
  entries: CollectionEntry[];
}

function yearOf(date: string | undefined): number | null {
  const y = Number.parseInt((date ?? '').slice(0, 4), 10);
  return Number.isFinite(y) ? y : null;
}

async function loadParts(collectionId: number): Promise<CachedCollection | null> {
  const key = `tmdbCollection:${collectionId}`;
  const cached = await settingsRepository.getSetting<CachedCollection>(key);
  if (cached !== undefined && Date.now() - cached.fetchedAt < TTL_MS) return cached;
  try {
    const raw = await collectionDetail(collectionId);
    if (raw === null) return cached ?? null;
    const value: CachedCollection = {
      fetchedAt: Date.now(),
      name: raw.name ?? 'Saga',
      parts: (raw.parts ?? [])
        .map((p: TmdbCollectionPartRaw) => ({ id: p.id, title: p.title ?? '', year: yearOf(p.release_date) }))
        .filter((p) => p.title !== '')
        .sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999)),
    };
    await settingsRepository.setSetting(key, value);
    return value;
  } catch {
    return cached ?? null;
  }
}

async function matchPart(part: { id: number; title: string; year: number | null }): Promise<Movie | null> {
  const byId = await catalogRepository.getMoviesByGroupKey(`t:${part.id}`);
  const best = byId.sort((a, b) => a.groupRank - b.groupRank)[0];
  if (best !== undefined) return best;
  const key = vodMatchKey(part.title);
  if (key.length < 3) return null;
  for (const m of await catalogRepository.searchMovies(part.title, 10)) {
    const y = displayYear(m.name, m.year);
    if (vodKeysMatch(key, vodMatchKey(m.name)) && (part.year === null || y === null || Math.abs(part.year - y) <= 1)) {
      return m;
    }
  }
  return null;
}

/** Saga du film (>= 2 films presents, film courant compris), sinon null. */
export async function loadCollection(collectionId: number): Promise<CollectionResult | null> {
  const parts = await loadParts(collectionId);
  if (parts === null || parts.parts.length < 2) return null;
  const entries: CollectionEntry[] = [];
  const seen = new Set<string>();
  for (const part of parts.parts.slice(0, 15)) {
    const movie = await matchPart(part);
    if (movie === null || seen.has(movie.groupKey)) continue;
    seen.add(movie.groupKey);
    entries.push({ movie, year: part.year });
  }
  return entries.length >= 2 ? { name: parts.name, entries } : null;
}
