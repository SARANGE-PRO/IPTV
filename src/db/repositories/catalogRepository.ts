import Dexie, { type Collection, type Table, type UpdateSpec } from 'dexie';
import { db } from '@/db/database';
import type {
  BoolNum,
  Category,
  LiveChannel,
  Movie,
  Section,
  Series,
  SeriesDetails,
  TmdbEnrichState,
} from '@/types/models';
import type { ChannelTheme } from '@/utils/channelTheme';
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

/** Taille de lot pour l'insertion mappee (borne le pic memoire). */
const REPLACE_CHUNK = 2000;

/**
 * Remplace une SECTION entiere (categories + items) de facon ATOMIQUE et par
 * LOTS, dans une seule transaction couvrant les deux tables :
 *  - atomicite : jamais de nouvelles categories avec d'anciens/zero items (ou
 *    l'inverse) si l'onglet ferme en cours de sync (invariant de coherence) ;
 *  - memoire bornee : on ne materialise jamais tout le tableau d'items normalise
 *    en plus du JSON brut (pic ~double sinon -> risque d'OOM iOS sur 30-50k items).
 * Retourne le nombre d'items ecrits. `source` (JSON brut) reste en memoire le
 * temps de l'operation — reduire davantage exigerait un fetch par categorie, differe.
 */
async function replaceCatalogTx<TIn, TOut>(
  catTable: Table<Category, string>,
  categories: Category[],
  itemTable: Table<TOut, string>,
  source: TIn[],
  map: (row: TIn) => TOut,
): Promise<number> {
  let count = 0;
  await db.transaction('rw', catTable, itemTable, async () => {
    await catTable.clear();
    await catTable.bulkPut(categories);
    await itemTable.clear();
    for (let i = 0; i < source.length; i += REPLACE_CHUNK) {
      const chunk = source.slice(i, i + REPLACE_CHUNK).map(map);
      await itemTable.bulkPut(chunk);
      count += chunk.length;
    }
  });
  return count;
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

/** Remplace atomiquement categories + chaines Live (memoire bornee). */
export function replaceLiveCatalog<R>(
  categories: Category[],
  rows: R[],
  map: (row: R) => LiveChannel,
): Promise<number> {
  return replaceCatalogTx(categoryTables.live, categories, db.xtream_live_streams, rows, map);
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

/** Filtres rapides Live (ergonomie unifiee). 'all' = tout le catalogue. */
export type LiveFilter =
  | { kind: 'all' }
  | { kind: 'french' }
  | { kind: 'nonFrench' }
  | { kind: 'frenchTheme'; theme: ChannelTheme }
  | { kind: 'uhd' }
  | { kind: 'theme'; theme: ChannelTheme };

function liveCollection(filter: LiveFilter) {
  switch (filter.kind) {
    case 'french':
      return db.xtream_live_streams.where('isFrench').equals(1);
    case 'nonFrench':
      return db.xtream_live_streams.where('isFrench').equals(0);
    case 'frenchTheme':
      return db.xtream_live_streams.where('[theme+isFrench]').equals([filter.theme, 1]);
    case 'uhd':
      return db.xtream_live_streams.where('isUhd').equals(1);
    case 'theme':
      return db.xtream_live_streams.where('theme').equals(filter.theme);
    default:
      return db.xtream_live_streams.toCollection();
  }
}

/** Page de chaines pour un filtre — jamais de chargement global des 55k. */
export function getLiveChannelsPage(filter: LiveFilter, offset: number, limit: number): Promise<LiveChannel[]> {
  return liveCollection(filter).offset(offset).limit(limit).toArray();
}

export function countLiveChannels(filter: LiveFilter): Promise<number> {
  return liveCollection(filter).count();
}

/** Voisins d'une chaine dans sa categorie, via l'index compose v4. */
export async function getLiveChannelNeighbors(
  categoryId: string,
  sortOrder: number,
): Promise<{ previous: LiveChannel | null; next: LiveChannel | null }> {
  const index = db.xtream_live_streams.where('[categoryId+sortOrder]');
  const [previous, next] = await Promise.all([
    index
      .between([categoryId, Dexie.minKey], [categoryId, sortOrder], true, false)
      .reverse()
      .first(),
    index
      .between([categoryId, sortOrder], [categoryId, Dexie.maxKey], false, true)
      .first(),
  ]);
  return { previous: previous ?? null, next: next ?? null };
}

// --- Films ------------------------------------------------------------------------

export function replaceMovies(movies: Movie[]): Promise<void> {
  return replaceAll(db.xtream_vod_streams, movies);
}

/** Remplace atomiquement categories + films (memoire bornee). */
export function replaceVodCatalog<R>(
  categories: Category[],
  rows: R[],
  map: (row: R) => Movie,
): Promise<number> {
  return replaceCatalogTx(categoryTables.vod, categories, db.xtream_vod_streams, rows, map);
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

export function getTopRatedMovies(limit: number): Promise<Movie[]> {
  return db.xtream_vod_streams.orderBy('rating').reverse().limit(limit).toArray();
}

export function getFrenchMovies(limit: number, order: 'recent' | 'rating' = 'recent'): Promise<Movie[]> {
  const index = order === 'rating' ? '[isFrench+rating]' : '[isFrench+addedAt]';
  return db.xtream_vod_streams
    .where(index)
    .between([1, Dexie.minKey], [1, Dexie.maxKey])
    .reverse()
    .limit(limit)
    .toArray();
}

// --- Series -------------------------------------------------------------------------

export function replaceSeries(series: Series[]): Promise<void> {
  return replaceAll(db.xtream_series, series);
}

/** Remplace atomiquement categories + series (memoire bornee). */
export function replaceSeriesCatalog<R>(
  categories: Category[],
  rows: R[],
  map: (row: R) => Series,
): Promise<number> {
  return replaceCatalogTx(categoryTables.series, categories, db.xtream_series, rows, map);
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

export function getTopRatedSeries(limit: number): Promise<Series[]> {
  return db.xtream_series.orderBy('rating').reverse().limit(limit).toArray();
}

export function getFrenchSeries(limit: number, order: 'recent' | 'rating' = 'recent'): Promise<Series[]> {
  const index = order === 'rating' ? '[isFrench+rating]' : '[isFrench+lastModifiedAt]';
  return db.xtream_series
    .where(index)
    .between([1, Dexie.minKey], [1, Dexie.maxKey])
    .reverse()
    .limit(limit)
    .toArray();
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

export async function clearSeriesDetailsCache(): Promise<void> {
  await db.xtream_series_details.clear();
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

/**
 * Parcours CURSEUR borne (memoire legere) : traite chaque ligne au fil de
 * l'eau sans jamais materialiser tout le catalogue. Renvoie le nombre scanne.
 */
export async function scanMovies(cap: number, onRow: (m: Movie) => void): Promise<number> {
  let n = 0;
  await db.xtream_vod_streams.limit(cap).each((m) => {
    onRow(m);
    n += 1;
  });
  return n;
}

export async function scanSeries(cap: number, onRow: (s: Series) => void): Promise<number> {
  let n = 0;
  await db.xtream_series.limit(cap).each((s) => {
    onRow(s);
    n += 1;
  });
  return n;
}

export async function scanLiveChannels(cap: number, onRow: (c: LiveChannel) => void): Promise<number> {
  let n = 0;
  await db.xtream_live_streams.limit(cap).each((c) => {
    onRow(c);
    n += 1;
  });
  return n;
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

export type CatalogSort = 'recommended' | 'recent' | 'rating' | 'year' | 'title';

function page<T>(collection: Collection<T, string>, offset: number, limit: number): Promise<T[]> {
  return collection.offset(offset).limit(limit).toArray();
}

export function getMoviesPage(
  categoryId: string,
  offset: number,
  limit: number,
  sort: CatalogSort = 'recommended',
): Promise<Movie[]> {
  if (sort === 'title') {
    return page(
      db.xtream_vod_streams
        .where('[categoryId+normalizedName]')
        .between([categoryId, Dexie.minKey], [categoryId, Dexie.maxKey]),
      offset,
      limit,
    );
  }
  if (sort === 'recent' || sort === 'rating' || sort === 'year') {
    const field = sort === 'recent' ? 'addedAt' : sort;
    return page(
      db.xtream_vod_streams
        .where(`[categoryId+${field}]`)
        .between([categoryId, Dexie.minKey], [categoryId, Dexie.maxKey])
        .reverse(),
      offset,
      limit,
    );
  }
  return page(db.xtream_vod_streams.where('categoryId').equals(categoryId), offset, limit);
}

export function getSeriesPage(
  categoryId: string,
  offset: number,
  limit: number,
  sort: CatalogSort = 'recommended',
): Promise<Series[]> {
  if (sort === 'title') {
    return page(
      db.xtream_series
        .where('[categoryId+normalizedName]')
        .between([categoryId, Dexie.minKey], [categoryId, Dexie.maxKey]),
      offset,
      limit,
    );
  }
  if (sort === 'recent' || sort === 'rating') {
    const field = sort === 'recent' ? 'lastModifiedAt' : 'rating';
    return page(
      db.xtream_series
        .where(`[categoryId+${field}]`)
        .between([categoryId, Dexie.minKey], [categoryId, Dexie.maxKey])
        .reverse(),
      offset,
      limit,
    );
  }
  return page(db.xtream_series.where('categoryId').equals(categoryId), offset, limit);
}

export function countByCategory(section: Section, categoryId: string): Promise<number> {
  if (section === 'live') return db.xtream_live_streams.where('categoryId').equals(categoryId).count();
  if (section === 'vod') return db.xtream_vod_streams.where('categoryId').equals(categoryId).count();
  return db.xtream_series.where('categoryId').equals(categoryId).count();
}

// --- Pagination A PLAT (refonte VOD, etape 2 : filtres TMDB, sans categorie) --------

/** Tri global d'une collection a plat. `rating`/`year` s'appuient sur les metadonnees TMDB. */
export type FlatSort = 'recent' | 'rating' | 'year' | 'title';

/**
 * Filtres frontend appliques sur TOUTE la collection, independamment des
 * categories fournisseur. Tous optionnels et cumulatifs (ET entre criteres) ; les
 * genres sont en OU (au moins un). La distinction FR de base est preservee via
 * `frenchOnly` (isFrench). Refonte VOD, etape 2.
 */
export interface CatalogFilter {
  /** Au moins un de ces genres TMDB. Vide/omis = pas de filtre genre. */
  genreIds?: number[];
  /** Annee TMDB minimale / maximale (inclusives). */
  minYear?: number;
  maxYear?: number;
  /** Note TMDB minimale (/10). */
  minRating?: number;
  /** Restreint aux contenus FR (isFrench=1). */
  frenchOnly?: boolean;
  /** Pseudo-filtre « Autres / Non classes » : items sans correspondance TMDB (tmdbState=2). */
  unclassifiedOnly?: boolean;
}

/** Champs minimaux lus par le predicat de filtrage (films et series). */
interface TmdbFilterable {
  categoryId: string;
  isFrench: BoolNum;
  tmdbGenreIds: number[];
  tmdbYear: number | null;
  tmdbRating: number | null;
  tmdbState: number;
}

function isEmptyFilter(f: CatalogFilter): boolean {
  return (
    (f.genreIds === undefined || f.genreIds.length === 0) &&
    f.minYear === undefined &&
    f.maxYear === undefined &&
    f.minRating === undefined &&
    f.frenchOnly !== true &&
    f.unclassifiedOnly !== true
  );
}

function buildPredicate(
  filter: CatalogFilter,
  hidden?: ReadonlySet<string>,
): (item: TmdbFilterable) => boolean {
  const genreIds = filter.genreIds ?? [];
  return (item) => {
    if (hidden !== undefined && hidden.has(item.categoryId)) return false;
    if (filter.frenchOnly === true && item.isFrench !== 1) return false;
    if (filter.unclassifiedOnly === true && item.tmdbState !== 2) return false;
    if (genreIds.length > 0 && !genreIds.some((g) => item.tmdbGenreIds.includes(g))) return false;
    if (filter.minYear !== undefined && (item.tmdbYear === null || item.tmdbYear < filter.minYear)) return false;
    if (filter.maxYear !== undefined && (item.tmdbYear === null || item.tmdbYear > filter.maxYear)) return false;
    if (filter.minRating !== undefined && (item.tmdbRating === null || item.tmdbRating < filter.minRating)) return false;
    return true;
  };
}

/**
 * Collection triee par index GLOBAL (jamais de tableau en RAM : Dexie parcourt
 * l'index et ne materialise que la page demandee). `rating`/`year` utilisent les
 * index TMDB -> les items non enrichis (cle nulle) en sont naturellement exclus.
 */
function moviesSorted(sort: FlatSort): Collection<Movie, string> {
  if (sort === 'title') return db.xtream_vod_streams.orderBy('normalizedName');
  if (sort === 'rating') return db.xtream_vod_streams.orderBy('tmdbRating').reverse();
  if (sort === 'year') return db.xtream_vod_streams.orderBy('tmdbYear').reverse();
  return db.xtream_vod_streams.orderBy('addedAt').reverse();
}

function seriesSorted(sort: FlatSort): Collection<Series, string> {
  if (sort === 'title') return db.xtream_series.orderBy('normalizedName');
  if (sort === 'rating') return db.xtream_series.orderBy('tmdbRating').reverse();
  if (sort === 'year') return db.xtream_series.orderBy('tmdbYear').reverse();
  return db.xtream_series.orderBy('lastModifiedAt').reverse();
}

/**
 * Page de films sur TOUTE la collection (« data flattening ») : tri par index
 * global + filtres TMDB en `.filter()` + pagination offset/limit. Aucune notion de
 * categorie fournisseur. Memoire bornee (seule la page est materialisee).
 */
export function getAllMoviesPage(
  offset: number,
  limit: number,
  sort: FlatSort = 'recent',
  filter: CatalogFilter = {},
  hidden?: ReadonlySet<string>,
): Promise<Movie[]> {
  return moviesSorted(sort).filter(buildPredicate(filter, hidden)).offset(offset).limit(limit).toArray();
}

/** Page de series sur toute la collection (voir getAllMoviesPage). */
export function getAllSeriesPage(
  offset: number,
  limit: number,
  sort: FlatSort = 'recent',
  filter: CatalogFilter = {},
  hidden?: ReadonlySet<string>,
): Promise<Series[]> {
  return seriesSorted(sort).filter(buildPredicate(filter, hidden)).offset(offset).limit(limit).toArray();
}

/**
 * Compte les films correspondant au filtre. Sans filtre ni blacklist -> compte
 * d'index (rapide). Avec filtre -> SCAN de table (lit les objets) : a utiliser
 * avec parcimonie (pas a chaque frappe/scroll).
 */
export function countAllMovies(filter: CatalogFilter = {}, hidden?: ReadonlySet<string>): Promise<number> {
  if (isEmptyFilter(filter) && hidden === undefined) return db.xtream_vod_streams.count();
  return db.xtream_vod_streams.filter(buildPredicate(filter, hidden)).count();
}

export function countAllSeries(filter: CatalogFilter = {}, hidden?: ReadonlySet<string>): Promise<number> {
  if (isEmptyFilter(filter) && hidden === undefined) return db.xtream_series.count();
  return db.xtream_series.filter(buildPredicate(filter, hidden)).count();
}

// --- Recherche (index multiEntry searchTokens, schema v2) ---------------------------

interface Searchable {
  id: string;
  name: string;
  normalizedName: string;
  categoryId: string;
  isFrench: BoolNum;
  searchTokens: string[];
}

/**
 * Recherche par prefixe de tokens via l'index multiEntry : le token le plus
 * long passe par l'index, les autres filtrent les candidats. Jamais de scan
 * complet de la table.
 *
 * `hiddenCategoryIds` : categories blacklistees exclues DANS le `.filter()`,
 * donc AVANT `.limit()` — sinon une grosse categorie masquee raflerait les N
 * premiers resultats et ferait disparaitre des correspondances legitimes.
 */
async function searchIn<T extends Searchable>(
  table: Table<T, string>,
  query: string,
  limit: number,
  hiddenCategoryIds?: ReadonlySet<string>,
): Promise<T[]> {
  const tokens = tokenizeQuery(query);
  const primary = tokens.reduce<string | null>(
    (best, t) => (best === null || t.length > best.length ? t : best),
    null,
  );
  if (primary === null) return [];
  const rest = tokens.filter((t) => t !== primary);
  const hidden = hiddenCategoryIds;

  const rows = await table
    .where('searchTokens')
    .startsWith(primary)
    .distinct()
    .filter(
      (item) =>
        (hidden === undefined || !hidden.has(item.categoryId)) &&
        rest.every((t) => item.searchTokens.some((tok) => tok.startsWith(t))),
    )
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

export function searchLiveChannels(
  query: string,
  limit = 60,
  hiddenCategoryIds?: ReadonlySet<string>,
): Promise<LiveChannel[]> {
  return searchIn(db.xtream_live_streams, query, limit, hiddenCategoryIds);
}

export function searchMovies(
  query: string,
  limit = 60,
  hiddenCategoryIds?: ReadonlySet<string>,
): Promise<Movie[]> {
  return searchIn(db.xtream_vod_streams, query, limit, hiddenCategoryIds);
}

export function searchSeries(
  query: string,
  limit = 60,
  hiddenCategoryIds?: ReadonlySet<string>,
): Promise<Series[]> {
  return searchIn(db.xtream_series, query, limit, hiddenCategoryIds);
}

// --- Enrichissement TMDB (refonte VOD, etape 1) --------------------------------

/**
 * Patch ecrit sur une ligne film/serie a l'issue de l'enrichissement TMDB.
 * `tmdbId` peut rester tel quel (deja fourni par le panel) — on ne le passe que
 * lorsqu'on l'a resolu par titre.
 */
export interface TmdbEnrichPatch {
  tmdbId?: number | null;
  tmdbGenreIds: number[];
  tmdbYear: number | null;
  tmdbRating: number | null;
  tmdbState: TmdbEnrichState;
}

/** Prochain lot de films en attente d'enrichissement (tmdbState = 0). */
export function getMoviesNeedingTmdb(limit: number): Promise<Movie[]> {
  return db.xtream_vod_streams.where('tmdbState').equals(0).limit(limit).toArray();
}

/** Prochain lot de series en attente d'enrichissement (tmdbState = 0). */
export function getSeriesNeedingTmdb(limit: number): Promise<Series[]> {
  return db.xtream_series.where('tmdbState').equals(0).limit(limit).toArray();
}

export function countMoviesNeedingTmdb(): Promise<number> {
  return db.xtream_vod_streams.where('tmdbState').equals(0).count();
}

export function countSeriesNeedingTmdb(): Promise<number> {
  return db.xtream_series.where('tmdbState').equals(0).count();
}

/** Write-back TMDB sur un film (mise a jour indexee, ne touche pas les autres champs). */
export async function updateMovieTmdb(id: string, patch: TmdbEnrichPatch): Promise<void> {
  await db.xtream_vod_streams.update(id, patch as UpdateSpec<Movie>);
}

/** Write-back TMDB sur une serie. */
export async function updateSeriesTmdb(id: string, patch: TmdbEnrichPatch): Promise<void> {
  await db.xtream_series.update(id, patch as UpdateSpec<Series>);
}
