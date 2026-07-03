import type { Table } from 'dexie';
import { db } from '@/db/database';
import type { BoolNum, Category, LiveChannel, Movie, Section, Series, SeriesDetails } from '@/types/models';
import { normalizeText, tokenizeQuery } from '@/utils/text';

/**
 * Acces au catalogue (categories, chaines, films, series).
 *
 * Strategie de remplacement : la sync (etape 4) remplace une table entiere de
 * facon atomique (clear + bulkPut). bulkPut plutot que bulkAdd : certains
 * panels Xtream renvoient des ids dupliques — dernier gagnant au lieu d'un
 * echec de sync.
 */

const categoryTables: Record<Section, Table<Category, string>> = {
  live: db.xtream_live_categories,
  vod: db.xtream_vod_categories,
  series: db.xtream_series_categories,
};

async function replaceAll<T>(table: Table<T, string>, rows: T[]): Promise<void> {
  await db.transaction('rw', table, async () => {
    await table.clear();
    await table.bulkPut(rows);
  });
}

// --- Categories ---------------------------------------------------------------

export function getCategories(section: Section): Promise<Category[]> {
  return categoryTables[section].orderBy('name').toArray();
}

export function getFrenchCategories(section: Section): Promise<Category[]> {
  return categoryTables[section].where('isFrench').equals(1).sortBy('name');
}

export function getCategoryById(section: Section, id: string): Promise<Category | undefined> {
  return categoryTables[section].get(id);
}

export function replaceCategories(section: Section, categories: Category[]): Promise<void> {
  return replaceAll(categoryTables[section], categories);
}

// --- Chaines live ---------------------------------------------------------------

export function replaceLiveChannels(channels: LiveChannel[]): Promise<void> {
  return replaceAll(db.xtream_live_streams, channels);
}

/** Chaines d'une categorie, triees par ordre fournisseur (sortOrder). */
export function getLiveChannelsByCategory(categoryId: string): Promise<LiveChannel[]> {
  return db.xtream_live_streams.where('categoryId').equals(categoryId).sortBy('sortOrder');
}

export function getLiveChannelById(id: string): Promise<LiveChannel | undefined> {
  return db.xtream_live_streams.get(id);
}

export async function getLiveChannelsByIds(ids: string[]): Promise<LiveChannel[]> {
  const rows = await db.xtream_live_streams.bulkGet(ids);
  return rows.filter((c): c is LiveChannel => c !== undefined);
}

// --- Films ------------------------------------------------------------------------

export function replaceMovies(movies: Movie[]): Promise<void> {
  return replaceAll(db.xtream_vod_streams, movies);
}

export function getMoviesByCategory(categoryId: string): Promise<Movie[]> {
  return db.xtream_vod_streams.where('categoryId').equals(categoryId).sortBy('name');
}

export function getMovieById(id: string): Promise<Movie | undefined> {
  return db.xtream_vod_streams.get(id);
}

export async function getMoviesByIds(ids: string[]): Promise<Movie[]> {
  const rows = await db.xtream_vod_streams.bulkGet(ids);
  return rows.filter((m): m is Movie => m !== undefined);
}

/** Films recemment ajoutes (les entrees sans addedAt sont hors index, donc exclues). */
export function getRecentMovies(limit: number): Promise<Movie[]> {
  return db.xtream_vod_streams.orderBy('addedAt').reverse().limit(limit).toArray();
}

// --- Series -------------------------------------------------------------------------

export function replaceSeries(series: Series[]): Promise<void> {
  return replaceAll(db.xtream_series, series);
}

export function getSeriesByCategory(categoryId: string): Promise<Series[]> {
  return db.xtream_series.where('categoryId').equals(categoryId).sortBy('name');
}

export function getSeriesById(id: string): Promise<Series | undefined> {
  return db.xtream_series.get(id);
}

export async function getSeriesByIds(ids: string[]): Promise<Series[]> {
  const rows = await db.xtream_series.bulkGet(ids);
  return rows.filter((s): s is Series => s !== undefined);
}

/** Series recemment modifiees (les entrees sans lastModifiedAt sont exclues). */
export function getRecentSeries(limit: number): Promise<Series[]> {
  return db.xtream_series.orderBy('lastModifiedAt').reverse().limit(limit).toArray();
}

export async function putSeriesDetails(details: SeriesDetails): Promise<void> {
  await db.xtream_series_details.put(details);
}

export function getSeriesDetails(seriesId: string): Promise<SeriesDetails | undefined> {
  return db.xtream_series_details.get(seriesId);
}

export async function deleteSeriesDetails(seriesId: string): Promise<void> {
  await db.xtream_series_details.delete(seriesId);
}

// --- Global -----------------------------------------------------------------------------

export async function getCatalogCounts(): Promise<Record<Section, number>> {
  const [live, vod, series] = await Promise.all([
    db.xtream_live_streams.count(),
    db.xtream_vod_streams.count(),
    db.xtream_series.count(),
  ]);
  return { live, vod, series };
}

/** Purge complete du catalogue (deconnexion). Ne touche ni favoris ni historique. */
export async function clearCatalog(): Promise<void> {
  await db.transaction(
    'rw',
    [
      db.xtream_live_categories,
      db.xtream_live_streams,
      db.xtream_vod_categories,
      db.xtream_vod_streams,
      db.xtream_series_categories,
      db.xtream_series,
      db.xtream_series_details,
    ],
    async () => {
      await Promise.all([
        db.xtream_live_categories.clear(),
        db.xtream_live_streams.clear(),
        db.xtream_vod_categories.clear(),
        db.xtream_vod_streams.clear(),
        db.xtream_series_categories.clear(),
        db.xtream_series.clear(),
        db.xtream_series_details.clear(),
      ]);
    },
  );
}

// --- Diagnostic -------------------------------------------------------------------

/** Echantillon de films (ordre cle primaire) — pour les exemples de titres. */
export function getMoviesSample(limit: number): Promise<Movie[]> {
  return db.xtream_vod_streams.limit(limit).toArray();
}

export function getSeriesSample(limit: number): Promise<Series[]> {
  return db.xtream_series.limit(limit).toArray();
}

/** Nombre d'items par categorie, via un scan de l'index (sans charger les objets). */
export async function getCategoryItemCounts(section: Section): Promise<Map<string, number>> {
  const keys =
    section === 'live'
      ? await db.xtream_live_streams.orderBy('categoryId').keys()
      : section === 'vod'
        ? await db.xtream_vod_streams.orderBy('categoryId').keys()
        : await db.xtream_series.orderBy('categoryId').keys();
  const counts = new Map<string, number>();
  for (const key of keys) {
    const id = String(key);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

export function countFrenchItems(section: Section): Promise<number> {
  if (section === 'live') return db.xtream_live_streams.where('isFrench').equals(1).count();
  if (section === 'vod') return db.xtream_vod_streams.where('isFrench').equals(1).count();
  return db.xtream_series.where('isFrench').equals(1).count();
}

// --- Pagination (gros catalogue : jamais de getAll global) --------------------------

export function getMoviesPage(categoryId: string, offset: number, limit: number): Promise<Movie[]> {
  return db.xtream_vod_streams.where('categoryId').equals(categoryId).offset(offset).limit(limit).toArray();
}

export function getSeriesPage(categoryId: string, offset: number, limit: number): Promise<Series[]> {
  return db.xtream_series.where('categoryId').equals(categoryId).offset(offset).limit(limit).toArray();
}

export function countByCategory(section: Section, categoryId: string): Promise<number> {
  if (section === 'live') return db.xtream_live_streams.where('categoryId').equals(categoryId).count();
  if (section === 'vod') return db.xtream_vod_streams.where('categoryId').equals(categoryId).count();
  return db.xtream_series.where('categoryId').equals(categoryId).count();
}

// --- Recherche (index multiEntry searchTokens, schema v2) ---------------------------

interface Searchable {
  id: string;
  name: string;
  normalizedName: string;
  isFrench: BoolNum;
  searchTokens: string[];
}

/**
 * Recherche par prefixe de tokens via l'index multiEntry : le token le plus
 * long passe par l'index, les autres filtrent les candidats. Jamais de scan
 * complet de la table.
 */
async function searchIn<T extends Searchable>(
  table: Table<T, string>,
  query: string,
  limit: number,
): Promise<T[]> {
  const tokens = tokenizeQuery(query);
  const primary = tokens.reduce<string | null>(
    (best, t) => (best === null || t.length > best.length ? t : best),
    null,
  );
  if (primary === null) return [];
  const rest = tokens.filter((t) => t !== primary);

  const rows = await table
    .where('searchTokens')
    .startsWith(primary)
    .distinct()
    .filter((item) => rest.every((t) => item.searchTokens.some((tok) => tok.startsWith(t))))
    .limit(limit)
    .toArray();

  const nq = normalizeText(query);
  return rows.sort(
    (a, b) =>
      Number(b.normalizedName.startsWith(nq)) - Number(a.normalizedName.startsWith(nq)) ||
      b.isFrench - a.isFrench ||
      a.name.localeCompare(b.name, 'fr'),
  );
}

export function searchLiveChannels(query: string, limit = 60): Promise<LiveChannel[]> {
  return searchIn(db.xtream_live_streams, query, limit);
}

export function searchMovies(query: string, limit = 60): Promise<Movie[]> {
  return searchIn(db.xtream_vod_streams, query, limit);
}

export function searchSeries(query: string, limit = 60): Promise<Series[]> {
  return searchIn(db.xtream_series, query, limit);
}
