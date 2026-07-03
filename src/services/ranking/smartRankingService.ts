import * as catalogRepository from '@/db/repositories/catalogRepository';
import * as favoritesRepository from '@/db/repositories/favoritesRepository';
import * as playbackRepository from '@/db/repositories/playbackRepository';
import * as settingsRepository from '@/db/repositories/settingsRepository';
import type { BoolNum, FavoriteEntry, Movie, PlaybackEntry, Series } from '@/types/models';

/**
 * Top 10 personnel et explicable. Aucun scraping ni scan global : les
 * candidats proviennent de petits pools indexes (recents + mieux notes), puis
 * sont dedoublonnes et scores localement.
 */

const CANDIDATE_LIMIT = 180;
const DAY_MS = 86_400_000;
const CACHE_TTL_MS = DAY_MS;

interface RankingCache {
  generatedAt: number;
  ids: string[];
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
  return rows.length > 0 ? rows : null;
}

function freshness(timestamp: number | null, now: number): number {
  if (timestamp === null) return 0;
  const ageDays = Math.max(0, (now - timestamp) / DAY_MS);
  return Math.max(0, 1 - ageDays / 120);
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

function rank<T extends { id: string; rating: number | null; isFrench: BoolNum }>(
  candidates: T[],
  timestamp: (item: T) => number | null,
  signals: { favoriteIds: Set<string>; watchedIds: Set<string> },
  limit: number,
): T[] {
  const now = Date.now();
  const unique = new Map(candidates.map((item) => [item.id, item]));
  return [...unique.values()]
    .map((item) => ({
      item,
      score:
        (item.rating ?? 0) * 0.72 +
        freshness(timestamp(item), now) * 2.2 +
        item.isFrench * 0.45 +
        Number(signals.favoriteIds.has(item.id)) * 1.8 +
        Number(signals.watchedIds.has(item.id)) * 0.65,
    }))
    .sort((a, b) => b.score - a.score || (b.item.rating ?? 0) - (a.item.rating ?? 0))
    .slice(0, limit)
    .map(({ item }) => item);
}

export async function getMovieTop10(limit = 10): Promise<Movie[]> {
  const cached = await cachedByIds('rankingTopMovies', limit, catalogRepository.getMoviesByIds);
  if (cached !== null) return cached;
  const [recent, rated, favorites, history] = await Promise.all([
    catalogRepository.getRecentMovies(CANDIDATE_LIMIT),
    catalogRepository.getTopRatedMovies(CANDIDATE_LIMIT),
    favoritesRepository.getAllFavorites(),
    playbackRepository.getRecentHistory(120),
  ]);
  const rows = rank([...recent, ...rated], (movie) => movie.addedAt, userSignals(favorites, history, 'vod'), limit);
  await settingsRepository.setSetting<RankingCache>('rankingTopMovies', {
    generatedAt: Date.now(),
    ids: rows.map((movie) => movie.id),
  });
  return rows;
}

export async function getSeriesTop10(limit = 10): Promise<Series[]> {
  const cached = await cachedByIds('rankingTopSeries', limit, catalogRepository.getSeriesByIds);
  if (cached !== null) return cached;
  const [recent, rated, favorites, history] = await Promise.all([
    catalogRepository.getRecentSeries(CANDIDATE_LIMIT),
    catalogRepository.getTopRatedSeries(CANDIDATE_LIMIT),
    favoritesRepository.getAllFavorites(),
    playbackRepository.getRecentHistory(120),
  ]);
  const rows = rank(
    [...recent, ...rated],
    (series) => series.lastModifiedAt,
    userSignals(favorites, history, 'series'),
    limit,
  );
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
