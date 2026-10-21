import type { TrendingEntry } from '@/types/trending';
import * as catalogRepository from '@/db/repositories/catalogRepository';
import { isFrenchWatchable, type MediaVariant, type VariantSource } from '@/types/mediaLanguage';
import type { Movie, Series } from '@/types/models';
import { displayYear } from '@/utils/displayTitle';
import { vodKeysMatch, vodMatchKey } from '@/utils/vodMatchKey';
import { apiUrl } from '@/services/apiBase';

/**
 * TENDANCES : on part de TMDB trending (ce qui est chaud mondialement, affiches
 * HD + titres FR propres) et on MATCHE sur le catalogue Xtream VF de l'utilisateur
 * (Dexie). On pioche dans ~60 tendances pour afficher les 10 REELLEMENT presents
 * (l'IPTV n'a pas forcement les 10 premiers). On garde de Xtream uniquement le
 * stream_id (pour la lecture) ; l'affiche et le titre viennent de TMDB.
 */

export interface TrendingItem {
  xtreamId: string;
  type: 'vod' | 'series';
  title: string; // titre TMDB (FR propre)
  posterPath: string; // fragment d'affiche TMDB (HD)
  /** Fragment d'image de fond TMDB (billboard), null si absent. */
  backdropPath: string | null;
  overview: string | null;
  genreIds: number[];
  rating: number | null;
  year: number | null;
  /** Variante de la version Xtream retenue (pastille). */
  variant: MediaVariant;
  variantSource: VariantSource;
}

export interface TrendingResult {
  movies: TrendingItem[];
  series: TrendingItem[];
}

async function fetchTrending(): Promise<{ movies: TrendingEntry[]; series: TrendingEntry[] }> {
  try {
    const res = await fetch(apiUrl('/api/trending'), { cache: 'no-store' });
    if (!res.ok) return { movies: [], series: [] };
    const data = (await res.json()) as { movies?: TrendingEntry[]; series?: TrendingEntry[] };
    return { movies: data.movies ?? [], series: data.series ?? [] };
  } catch {
    return { movies: [], series: [] };
  }
}

function yearClose(a: number | null, b: number | null): boolean {
  return a === null || b === null || Math.abs(a - b) <= 1;
}

/**
 * Cherche l'entree Xtream correspondant a une tendance TMDB — regardable en
 * francais (variante VF/MULTI/VOSTFR persistee, chantier 1). La recherche
 * renvoie deja une version par titre, la preferee en tete.
 */
async function matchOne<T extends Movie | Series>(
  entry: TrendingEntry,
  search: (q: string, limit: number) => Promise<T[]>,
  yearOfRow: (row: T) => number | null,
  used: Set<string>,
): Promise<T | null> {
  if (entry.posterPath === null) return null;
  const key = vodMatchKey(entry.title);
  if (key.length < 3) return null;
  const candidates = await search(entry.title, 30);
  for (const c of candidates) {
    if (used.has(c.id) || !isFrenchWatchable(c.variant)) continue;
    if (!vodKeysMatch(key, vodMatchKey(c.name))) continue;
    if (!yearClose(entry.year, yearOfRow(c))) continue;
    return c;
  }
  return null;
}

function toItem(entry: TrendingEntry, hit: Movie | Series, type: 'vod' | 'series', posterPath: string): TrendingItem {
  return {
    xtreamId: hit.id,
    type,
    title: entry.title,
    posterPath,
    backdropPath: entry.backdropPath ?? null,
    overview: entry.overview,
    genreIds: entry.genreIds ?? [],
    rating: entry.rating,
    year: entry.year,
    variant: hit.variant,
    variantSource: hit.variantSource,
  };
}

/** Memo de session : le matching (~60 recherches Dexie) ne se refait pas a chaque retour sur l'accueil. */
const MEMO_TTL_MS = 15 * 60 * 1000;
let memo: { at: number; key: string; limit: number; result: TrendingResult } | null = null;

/**
 * Charge les tendances mappees sur le catalogue VF. `limit` = nombre a AFFICHER
 * par type (on scanne plus large pour l'atteindre). `memoKey` : change quand le
 * catalogue ou la preference de langue change (invalide le memo).
 */
export async function loadTrending(limit = 10, memoKey = ''): Promise<TrendingResult> {
  if (memo !== null && memo.key === memoKey && memo.limit >= limit && Date.now() - memo.at < MEMO_TTL_MS) {
    return { movies: memo.result.movies.slice(0, limit), series: memo.result.series.slice(0, limit) };
  }
  const { movies, series } = await fetchTrending();
  if (movies.length === 0 && series.length === 0) return { movies: [], series: [] };

  const usedMovies = new Set<string>();
  const matchedMovies: TrendingItem[] = [];
  for (const entry of movies) {
    if (matchedMovies.length >= limit) break;
    const hit = await matchOne(entry, catalogRepository.searchMovies, (m) => displayYear(m.name, m.year), usedMovies);
    if (hit !== null && entry.posterPath !== null) {
      usedMovies.add(hit.id);
      matchedMovies.push(toItem(entry, hit, 'vod', entry.posterPath));
    }
  }

  const usedSeries = new Set<string>();
  const matchedSeries: TrendingItem[] = [];
  for (const entry of series) {
    if (matchedSeries.length >= limit) break;
    const hit = await matchOne(entry, catalogRepository.searchSeries, (s) => s.year, usedSeries);
    if (hit !== null && entry.posterPath !== null) {
      usedSeries.add(hit.id);
      matchedSeries.push(toItem(entry, hit, 'series', entry.posterPath));
    }
  }

  const result = { movies: matchedMovies, series: matchedSeries };
  memo = { at: Date.now(), key: memoKey, limit, result };
  return result;
}
