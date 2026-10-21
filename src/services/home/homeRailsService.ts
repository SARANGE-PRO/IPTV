import * as catalogRepository from '@/db/repositories/catalogRepository';
import * as favoritesRepository from '@/db/repositories/favoritesRepository';
import * as playbackRepository from '@/db/repositories/playbackRepository';
import * as tmdbRepository from '@/db/repositories/tmdbRepository';
import type { TrendingItem } from '@/services/discovery/trendingService';
import { getMovieTop10, getSeriesTop10 } from '@/services/ranking/smartRankingService';
import { ensureGenres } from '@/services/tmdb/tmdbGenreService';
import { tmdbBackdrop } from '@/services/tmdb/tmdbImage';
import { tmdbCacheKey } from '@/services/tmdb/tmdbMatcher';
import type { MediaVariant, VariantSource } from '@/types/mediaLanguage';
import type { Movie, Series } from '@/types/models';
import { displayTitle } from '@/utils/displayTitle';

/**
 * Rangees EDITORIALES de l'accueil (chantier P4) : billboard, « Ma liste »,
 * rangees par genre, « Parce que tu as regarde… ». Tout est calcule LOCALEMENT
 * (Dexie, index bornes) a partir des champs persistes aux chantiers 1-3
 * (variante, groupe de versions, genres/notes TMDB) — aucun appel reseau hors
 * tendances (deja en cache serveur) et noms de genres (cache Dexie).
 */

const RAIL_LIMIT = 18;
const RAIL_MIN = 6;

type VodSection = 'vod' | 'series';

// --- Ma liste ------------------------------------------------------------------

export type MyListEntry = { type: 'vod'; item: Movie } | { type: 'series'; item: Series };

/** Favoris films + series, du plus recemment ajoute au plus ancien. */
export async function loadMyList(limit = 24): Promise<MyListEntry[]> {
  const favorites = (await favoritesRepository.getAllFavorites())
    .filter((f) => f.type === 'vod' || f.type === 'series')
    .slice(0, limit);
  const [movies, series] = await Promise.all([
    catalogRepository.getMoviesByIds(favorites.filter((f) => f.type === 'vod').map((f) => f.itemId)),
    catalogRepository.getSeriesByIds(favorites.filter((f) => f.type === 'series').map((f) => f.itemId)),
  ]);
  const movieById = new Map(movies.map((m) => [m.id, m]));
  const seriesById = new Map(series.map((s) => [s.id, s]));
  const out: MyListEntry[] = [];
  for (const f of favorites) {
    if (f.type === 'vod') {
      const item = movieById.get(f.itemId);
      if (item !== undefined) out.push({ type: 'vod', item });
    } else {
      const item = seriesById.get(f.itemId);
      if (item !== undefined) out.push({ type: 'series', item });
    }
  }
  return out;
}

// --- Genres --------------------------------------------------------------------

export interface GenreRail<T> {
  genreId: number;
  title: string;
  items: T[];
}

/** Genres mis en avant par defaut (ids TMDB). */
const DEFAULT_MOVIE_GENRES = [28, 35, 878, 53, 27, 16, 10751, 80];
const DEFAULT_TV_GENRES = [80, 35, 10765, 18, 10759, 9648];

/** Libelles de repli (TMDB fr-FR) si la table des genres n'est pas encore chargee. */
const FALLBACK_GENRE_NAMES: Record<'movie' | 'tv', Record<number, string>> = {
  movie: {
    28: 'Action', 12: 'Aventure', 16: 'Animation', 35: 'Comédie', 80: 'Crime', 99: 'Documentaire',
    18: 'Drame', 10751: 'Familial', 14: 'Fantastique', 27: 'Horreur', 10749: 'Romance',
    878: 'Science-Fiction', 53: 'Thriller', 10752: 'Guerre', 37: 'Western', 9648: 'Mystère',
  },
  tv: {
    10759: 'Action & Aventure', 16: 'Animation', 35: 'Comédie', 80: 'Crime', 99: 'Documentaire',
    18: 'Drame', 10751: 'Familial', 10762: 'Kids', 9648: 'Mystère', 10765: 'Science-Fiction & Fantastique',
  },
};

/** Genres les plus regardes recemment (signal perso), du plus au moins frequent. */
async function personalGenres(section: VodSection): Promise<number[]> {
  const history = await playbackRepository.getRecentHistory(80);
  const ids =
    section === 'vod'
      ? history.filter((e) => e.type === 'vod').map((e) => e.itemId)
      : [...new Set(history.filter((e) => e.type === 'episode' && e.seriesId !== null).map((e) => e.seriesId ?? ''))];
  if (ids.length === 0) return [];
  const rows =
    section === 'vod' ? await catalogRepository.getMoviesByIds(ids) : await catalogRepository.getSeriesByIds(ids);
  const counts = new Map<number, number>();
  for (const row of rows) for (const g of row.tmdbGenreIds) counts.set(g, (counts.get(g) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([g]) => g);
}

function visible(hidden: ReadonlySet<string>) {
  return (row: { posterUrl: string | null; categoryId: string }): boolean =>
    row.posterUrl !== null && !hidden.has(row.categoryId);
}

/**
 * Rangees par genre : 2 genres « perso » (historique) puis les genres par
 * defaut, `count` rangees au plus, chacune triee par note (variante preferee
 * d'abord). Une rangee trop maigre (< 6 titres) est ignoree.
 */
export async function loadGenreRails(
  section: 'vod',
  order: readonly MediaVariant[],
  hidden: ReadonlySet<string>,
  count: number,
): Promise<GenreRail<Movie>[]>;
export async function loadGenreRails(
  section: 'series',
  order: readonly MediaVariant[],
  hidden: ReadonlySet<string>,
  count: number,
): Promise<GenreRail<Series>[]>;
export async function loadGenreRails(
  section: VodSection,
  order: readonly MediaVariant[],
  hidden: ReadonlySet<string>,
  count: number,
): Promise<GenreRail<Movie>[] | GenreRail<Series>[]> {
  const kind = section === 'vod' ? 'movie' : 'tv';
  const [loaded, personal] = await Promise.all([ensureGenres(kind).catch(() => new Map<number, string>()), personalGenres(section)]);
  const fallback = FALLBACK_GENRE_NAMES[kind];
  const nameOf = (g: number): string | undefined => loaded.get(g) ?? fallback[g];
  const defaults = section === 'vod' ? DEFAULT_MOVIE_GENRES : DEFAULT_TV_GENRES;
  const candidates = [...new Set([...personal.slice(0, 2), ...defaults])].filter((g) => nameOf(g) !== undefined);
  const isVisible = visible(hidden);
  const rails: GenreRail<Movie | Series>[] = [];
  for (const genreId of candidates) {
    if (rails.length >= count) break;
    const predicate = (row: Movie | Series): boolean => isVisible(row) && row.tmdbGenreIds.includes(genreId);
    const items =
      section === 'vod'
        ? await catalogRepository.findMovies(predicate, RAIL_LIMIT, order, 'rating')
        : await catalogRepository.findSeries(predicate, RAIL_LIMIT, order, 'rating');
    if (items.length >= RAIL_MIN) rails.push({ genreId, title: nameOf(genreId) ?? 'Genre', items });
  }
  return rails as GenreRail<Movie>[] | GenreRail<Series>[];
}

// --- « Parce que tu as regarde » ---------------------------------------------

export type BecauseRail =
  | { type: 'vod'; sourceTitle: string; items: Movie[] }
  | { type: 'series'; sourceTitle: string; items: Series[] };

/** Titres proches (genres en commun) du dernier film / de la derniere serie regardes. */
export async function loadBecauseYouWatched(
  order: readonly MediaVariant[],
  hiddenVod: ReadonlySet<string>,
  hiddenSeries: ReadonlySet<string>,
): Promise<BecauseRail[]> {
  const history = await playbackRepository.getRecentHistory(40);
  const movieIds = [...new Set(history.filter((e) => e.type === 'vod').map((e) => e.itemId))].slice(0, 8);
  const seriesIds = [
    ...new Set(history.filter((e) => e.type === 'episode' && e.seriesId !== null).map((e) => e.seriesId ?? '')),
  ].slice(0, 8);
  const [movies, series] = await Promise.all([
    catalogRepository.getMoviesByIds(movieIds),
    catalogRepository.getSeriesByIds(seriesIds),
  ]);
  const rails: BecauseRail[] = [];

  const movieSource = movieIds
    .map((id) => movies.find((m) => m.id === id))
    .find((m): m is Movie => m !== undefined && m.tmdbGenreIds.length > 0);
  if (movieSource !== undefined) {
    const items = await catalogRepository.findMovies(
      similarTo(movieSource, visible(hiddenVod)),
      RAIL_LIMIT,
      order,
      'rating',
    );
    if (items.length >= RAIL_MIN) rails.push({ type: 'vod', sourceTitle: displayTitle(movieSource.name), items });
  }

  const seriesSource = seriesIds
    .map((id) => series.find((s) => s.id === id))
    .find((s): s is Series => s !== undefined && s.tmdbGenreIds.length > 0);
  if (seriesSource !== undefined) {
    const items = await catalogRepository.findSeries(
      similarTo(seriesSource, visible(hiddenSeries)),
      RAIL_LIMIT,
      order,
      'rating',
    );
    if (items.length >= RAIL_MIN) rails.push({ type: 'series', sourceTitle: displayTitle(seriesSource.name), items });
  }
  return rails;
}

/** Au moins 2 genres en commun (1 si la source n'en a qu'un), hors le titre lui-meme. */
function similarTo<T extends Movie | Series>(
  source: T,
  isVisible: (row: { posterUrl: string | null; categoryId: string }) => boolean,
): (row: T) => boolean {
  const genres = new Set(source.tmdbGenreIds);
  const needed = Math.min(2, genres.size);
  return (row) => {
    if (row.groupKey === source.groupKey || !isVisible(row) || row.ratingSort < 5) return false;
    let shared = 0;
    for (const g of row.tmdbGenreIds) if (genres.has(g)) shared += 1;
    return shared >= needed;
  };
}

// --- Billboard -----------------------------------------------------------------

export interface BillboardItem {
  key: string;
  type: VodSection;
  id: string;
  title: string;
  overview: string | null;
  /** Image de fond paysage (HD), sinon null -> affiche floutee. */
  backdrop: string | null;
  poster: string | null;
  year: number | null;
  rating: number | null;
  genres: string[];
  variant: MediaVariant;
  variantSource: VariantSource;
}

const BILLBOARD_SIZE = 6;

/**
 * Selection du billboard : tendances TMDB presentes au catalogue (titres FR,
 * backdrops HD, synopsis), films et series alternes. Sans TMDB (non configure,
 * hors ligne) : repli sur le Top 10 local avec les backdrops deja en cache.
 */
export async function loadBillboard(trending: { movies: TrendingItem[]; series: TrendingItem[] }): Promise<BillboardItem[]> {
  const fromTrending = interleave(
    trending.movies.filter((t) => t.backdropPath !== null),
    trending.series.filter((t) => t.backdropPath !== null),
  ).slice(0, BILLBOARD_SIZE);

  if (fromTrending.length > 0) {
    const [movieGenres, tvGenres] = await Promise.all([ensureGenres('movie'), ensureGenres('tv')]);
    return fromTrending.map((t) => ({
      key: `${t.type}:${t.xtreamId}`,
      type: t.type,
      id: t.xtreamId,
      title: t.title,
      overview: t.overview,
      backdrop: tmdbBackdrop(t.backdropPath, 'w1280'),
      poster: null,
      year: t.year,
      rating: t.rating,
      genres: t.genreIds
        .map((g) => (t.type === 'vod' ? movieGenres : tvGenres).get(g))
        .filter((n): n is string => n !== undefined)
        .slice(0, 3),
      variant: t.variant,
      variantSource: t.variantSource,
    }));
  }

  const [movies, series] = await Promise.all([getMovieTop10(BILLBOARD_SIZE), getSeriesTop10(BILLBOARD_SIZE)]);
  const entries = await tmdbRepository.getTmdbEntries([
    ...movies.map((m) => tmdbCacheKey('movie', m.name)),
    ...series.map((s) => tmdbCacheKey('tv', s.name)),
  ]);
  const local: BillboardItem[] = [
    ...movies.map((m) => {
      const meta = entries.get(tmdbCacheKey('movie', m.name))?.data ?? null;
      return {
        key: `vod:${m.id}`,
        type: 'vod' as const,
        id: m.id,
        title: displayTitle(m.name),
        overview: meta?.overview ?? null,
        backdrop: tmdbBackdrop(meta?.backdropPath ?? null, 'w1280'),
        poster: m.posterUrl,
        year: m.tmdbYear ?? m.year,
        rating: m.ratingSort > 0 ? m.ratingSort : null,
        genres: meta?.genres.slice(0, 3) ?? [],
        variant: m.variant,
        variantSource: m.variantSource,
      };
    }),
    ...series.map((s) => {
      const meta = entries.get(tmdbCacheKey('tv', s.name))?.data ?? null;
      return {
        key: `series:${s.id}`,
        type: 'series' as const,
        id: s.id,
        title: displayTitle(s.name),
        overview: meta?.overview ?? s.plot,
        backdrop: tmdbBackdrop(meta?.backdropPath ?? null, 'w1280') ?? s.backdropUrl,
        poster: s.posterUrl,
        year: s.tmdbYear ?? s.year,
        rating: s.ratingSort > 0 ? s.ratingSort : null,
        genres: meta?.genres.slice(0, 3) ?? [],
        variant: s.variant,
        variantSource: s.variantSource,
      };
    }),
  ];
  // Les titres avec image de fond d'abord (rendu billboard), le reste en repli.
  return [...local.filter((b) => b.backdrop !== null), ...local.filter((b) => b.backdrop === null)].slice(
    0,
    BILLBOARD_SIZE,
  );
}

function interleave<T>(a: T[], b: T[]): T[] {
  const out: T[] = [];
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const x = a[i];
    const y = b[i];
    if (x !== undefined) out.push(x);
    if (y !== undefined) out.push(y);
  }
  return out;
}
