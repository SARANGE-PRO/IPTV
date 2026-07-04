import * as catalogRepository from '@/db/repositories/catalogRepository';
import * as favoritesRepository from '@/db/repositories/favoritesRepository';
import * as playbackRepository from '@/db/repositories/playbackRepository';
import * as settingsRepository from '@/db/repositories/settingsRepository';
import { baseTitleKey } from '@/services/media/languageVariantService';
import type { BoolNum, FavoriteEntry, Movie, PlaybackEntry, Series } from '@/types/models';

/**
 * Top 10 / selections « a voir » — donnees SOLIDES et explicables. Aucun scraping
 * ni scan global : candidats issus de petits pools indexes (mieux notes + recents),
 * puis (1) GARDE QUALITE (affiche presente + note credible), (2) DEDUP par titre
 * canonique (une seule entree par film, pas les variantes VF/VOSTFR/4K), (3) score
 * DOMINE PAR LA NOTE (la fraicheur n'est qu'un bonus -> plus de « recent sans note »
 * en tete). Repli gracieux affiche-seule si trop peu d'items notes.
 */

const CANDIDATE_LIMIT = 240;
const DAY_MS = 86_400_000;
const CACHE_TTL_MS = DAY_MS;
// Note credible minimale (echelle 0..10). En-dessous = pas « a la une ».
const MIN_RATING = 6;

interface RankingCache {
  generatedAt: number;
  ids: string[];
}

interface Rankable {
  id: string;
  name: string;
  rating: number | null;
  isFrench: BoolNum;
  posterUrl: string | null;
}

async function cachedByIds<T extends { id: string }>(
  key: string,
  limit: number,
  load: (ids: string[]) => Promise<T[]>,
): Promise<T[] | null> {
  const cached = await settingsRepository.getSetting<RankingCache>(key);
  if (cached === undefined || Date.now() - cached.generatedAt >= CACHE_TTL_MS || cached.ids.length < limit) {
    return null;
  }
  const ids = cached.ids.slice(0, limit);
  const byId = new Map((await load(ids)).map((item) => [item.id, item]));
  const rows = ids.map((id) => byId.get(id)).filter((item): item is T => item !== undefined);
  return rows.length >= limit ? rows : null;
}

function freshness(timestamp: number | null, now: number): number {
  if (timestamp === null) return 0;
  const ageDays = Math.max(0, (now - timestamp) / DAY_MS);
  return Math.max(0, 1 - ageDays / 180);
}

function userSignals(
  favorites: FavoriteEntry[],
  history: PlaybackEntry[],
  type: 'vod' | 'series',
): { favoriteIds: Set<string>; watchedIds: Set<string> } {
  const favoriteIds = new Set(favorites.filter((f) => f.type === type).map((f) => f.itemId));
  const watchedIds = new Set<string>();
  for (const entry of history) {
    if (type === 'vod' && entry.type === 'vod') watchedIds.add(entry.itemId);
    if (type === 'series' && entry.type === 'episode' && entry.seriesId !== null) {
      watchedIds.add(entry.seriesId);
    }
  }
  return { favoriteIds, watchedIds };
}

/** Score : la NOTE domine (x3), fraicheur/FR/signaux perso = bonus secondaires. */
function scoreOf<T extends Rankable>(
  item: T,
  timestamp: (item: T) => number | null,
  now: number,
  signals: { favoriteIds: Set<string>; watchedIds: Set<string> },
): number {
  const ratingScore = (item.rating ?? 0) / 10; // 0..1
  return (
    ratingScore * 3.0 +
    freshness(timestamp(item), now) * 1.0 +
    item.isFrench * 0.6 +
    Number(signals.favoriteIds.has(item.id)) * 1.5 +
    Number(signals.watchedIds.has(item.id)) * 0.5
  );
}

/**
 * Selection curatee : garde qualite -> dedup titre canonique -> tri par score.
 * Deux passes : d'abord les items NOTES (>=MIN_RATING) et avec affiche ; si le
 * quota n'est pas atteint, complete avec des items a affiche (fraicheur).
 */
function curate<T extends Rankable>(
  candidates: T[],
  timestamp: (item: T) => number | null,
  signals: { favoriteIds: Set<string>; watchedIds: Set<string> },
  limit: number,
): T[] {
  const now = Date.now();
  // Dedup par titre canonique : on garde la meilleure entree (score) par film.
  const bestByTitle = new Map<string, { item: T; score: number; solid: boolean }>();
  for (const item of candidates) {
    if (item.posterUrl === null) continue; // pas d'affiche -> jamais « a la une »
    const key = baseTitleKey(item.name) || item.id;
    const score = scoreOf(item, timestamp, now, signals);
    const solid = item.rating !== null && item.rating >= MIN_RATING;
    const existing = bestByTitle.get(key);
    if (existing === undefined || score > existing.score) bestByTitle.set(key, { item, score, solid });
  }
  const ranked = [...bestByTitle.values()].sort((a, b) => b.score - a.score);
  const solid = ranked.filter((r) => r.solid).map((r) => r.item);
  if (solid.length >= limit) return solid.slice(0, limit);
  // Repli : complete avec les meilleurs restants (affiche presente) sans doublon.
  const chosen = new Set(solid.map((i) => i.id));
  const fill = ranked.filter((r) => !chosen.has(r.item.id)).map((r) => r.item);
  return [...solid, ...fill].slice(0, limit);
}

export async function getMovieTop10(limit = 10): Promise<Movie[]> {
  const cached = await cachedByIds('rankingTopMovies', limit, catalogRepository.getMoviesByIds);
  if (cached !== null) return cached;
  const [rated, recent, favorites, history] = await Promise.all([
    catalogRepository.getTopRatedMovies(CANDIDATE_LIMIT),
    catalogRepository.getRecentMovies(CANDIDATE_LIMIT),
    favoritesRepository.getAllFavorites(),
    playbackRepository.getRecentHistory(120),
  ]);
  const rows = curate([...rated, ...recent], (m) => m.addedAt, userSignals(favorites, history, 'vod'), limit);
  await settingsRepository.setSetting<RankingCache>('rankingTopMovies', {
    generatedAt: Date.now(),
    ids: rows.map((movie) => movie.id),
  });
  return rows;
}

export async function getSeriesTop10(limit = 10): Promise<Series[]> {
  const cached = await cachedByIds('rankingTopSeries', limit, catalogRepository.getSeriesByIds);
  if (cached !== null) return cached;
  const [rated, recent, favorites, history] = await Promise.all([
    catalogRepository.getTopRatedSeries(CANDIDATE_LIMIT),
    catalogRepository.getRecentSeries(CANDIDATE_LIMIT),
    favoritesRepository.getAllFavorites(),
    playbackRepository.getRecentHistory(120),
  ]);
  const rows = curate([...rated, ...recent], (s) => s.lastModifiedAt, userSignals(favorites, history, 'series'), limit);
  await settingsRepository.setSetting<RankingCache>('rankingTopSeries', {
    generatedAt: Date.now(),
    ids: rows.map((series) => series.id),
  });
  return rows;
}

export async function clearSmartRankingCache(): Promise<void> {
  await Promise.all([
    settingsRepository.removeSetting('rankingTopMovies'),
    settingsRepository.removeSetting('rankingTopSeries'),
  ]);
}
