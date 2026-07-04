import type { TrendingEntry } from '@/app/api/trending/route';
import * as catalogRepository from '@/db/repositories/catalogRepository';
import type { Movie, Series } from '@/types/models';
import { displayYear } from '@/utils/displayTitle';
import { vodKeysMatch, vodMatchKey } from '@/utils/vodMatchKey';

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
  rating: number | null;
  year: number | null;
}

async function fetchTrending(): Promise<{ movies: TrendingEntry[]; series: TrendingEntry[] }> {
  try {
    const res = await fetch('/api/trending', { cache: 'no-store' });
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

/** Cherche l'entree Xtream VF correspondant a une tendance TMDB. */
async function matchOne<T extends Movie | Series>(
  entry: TrendingEntry,
  search: (q: string, limit: number) => Promise<T[]>,
  vfCats: ReadonlySet<string>,
  yearOfRow: (row: T) => number | null,
  used: Set<string>,
): Promise<T | null> {
  if (entry.posterPath === null) return null;
  const key = vodMatchKey(entry.title);
  if (key.length < 3) return null;
  const candidates = await search(entry.title, 30);
  for (const c of candidates) {
    if (used.has(c.id) || !vfCats.has(c.categoryId)) continue;
    if (!vodKeysMatch(key, vodMatchKey(c.name))) continue;
    if (!yearClose(entry.year, yearOfRow(c))) continue;
    return c;
  }
  return null;
}

/**
 * Charge les tendances mappees sur le catalogue VF. `limit` = nombre a AFFICHER
 * par type (on scanne plus large pour l'atteindre).
 */
export async function loadTrending(limit = 10): Promise<{ movies: TrendingItem[]; series: TrendingItem[] }> {
  const { movies, series } = await fetchTrending();
  if (movies.length === 0 && series.length === 0) return { movies: [], series: [] };

  const [vodCats, seriesCats] = await Promise.all([
    catalogRepository.getFrenchCategories('vod'),
    catalogRepository.getFrenchCategories('series'),
  ]);
  const vodCatIds = new Set(vodCats.map((c) => c.id));
  const seriesCatIds = new Set(seriesCats.map((c) => c.id));

  const usedMovies = new Set<string>();
  const matchedMovies: TrendingItem[] = [];
  for (const entry of movies) {
    if (matchedMovies.length >= limit) break;
    const hit = await matchOne(entry, catalogRepository.searchMovies, vodCatIds, (m) => displayYear(m.name, m.year), usedMovies);
    if (hit !== null && entry.posterPath !== null) {
      usedMovies.add(hit.id);
      matchedMovies.push({ xtreamId: hit.id, type: 'vod', title: entry.title, posterPath: entry.posterPath, rating: entry.rating, year: entry.year });
    }
  }

  const usedSeries = new Set<string>();
  const matchedSeries: TrendingItem[] = [];
  for (const entry of series) {
    if (matchedSeries.length >= limit) break;
    const hit = await matchOne(
      entry,
      catalogRepository.searchSeries,
      seriesCatIds,
      (s) => displayYear(s.name, s.releaseDate != null ? Number.parseInt(s.releaseDate.slice(0, 4), 10) : null),
      usedSeries,
    );
    if (hit !== null && entry.posterPath !== null) {
      usedSeries.add(hit.id);
      matchedSeries.push({ xtreamId: hit.id, type: 'series', title: entry.title, posterPath: entry.posterPath, rating: entry.rating, year: entry.year });
    }
  }

  return { movies: matchedMovies, series: matchedSeries };
}
