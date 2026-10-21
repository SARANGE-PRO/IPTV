import Dexie, { type Collection, type Table, type UpdateSpec } from 'dexie';
import { db } from '@/db/database';
import type { AudioLane, MediaVariant } from '@/types/mediaLanguage';
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
import { tmdbGroupKey } from '@/utils/mediaTitle';
import { normalizeText, tokenizeQuery } from '@/utils/text';
import { DEFAULT_VARIANT_ORDER, variantRank } from '@/utils/variantPreference';

/**
 * Acces au catalogue (categories, chaines, films, series).
 *
 * Strategie de remplacement : la sync (etape 4) remplace une table entiere de
 * facon atomique (clear + bulkPut). bulkPut plutot que bulkAdd : certains
 * panels Xtream renvoient des ids dupliques — dernier gagnant au lieu d'un
 * echec de sync.
 *
 * Films / series (chantiers 1-2) : navigation A PLAT uniquement, par index
 * composes `[groupRank+variant+X]` (une carte par titre, tiers par preference
 * de langue) et `[laneRank+lane+X]` (pills VF / VOSTFR / VO). Jamais de scan
 * global : seule la page demandee est materialisee.
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

export function getMovieById(id: string): Promise<Movie | undefined> {
  return db.xtream_vod_streams.get(id);
}

export async function getMoviesByIds(ids: string[]): Promise<Movie[]> {
  const rows = await db.xtream_vod_streams.bulkGet(ids);
  return rows.filter((m): m is Movie => m !== undefined);
}

/** Toutes les versions (VF/VOSTFR/4K…) d'un meme titre — selecteur de version. */
export function getMoviesByGroupKey(groupKey: string): Promise<Movie[]> {
  return db.xtream_vod_streams.where('groupKey').equals(groupKey).toArray();
}

/**
 * Version REPRESENTATIVE (groupRank 0) des films de plusieurs groupes — p. ex.
 * filmographie d'un acteur (cles `t:<tmdbId>`). Requete d'index `anyOf`, bornee.
 */
export function getMoviesByGroupKeys(groupKeys: readonly string[], limit: number): Promise<Movie[]> {
  if (groupKeys.length === 0) return Promise.resolve([]);
  return db.xtream_vod_streams
    .where('groupKey')
    .anyOf([...groupKeys])
    .filter((m) => m.groupRank === 0)
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

export function getSeriesById(id: string): Promise<Series | undefined> {
  return db.xtream_series.get(id);
}

export async function getSeriesByIds(ids: string[]): Promise<Series[]> {
  const rows = await db.xtream_series.bulkGet(ids);
  return rows.filter((s): s is Series => s !== undefined);
}

export function getSeriesByGroupKey(groupKey: string): Promise<Series[]> {
  return db.xtream_series.where('groupKey').equals(groupKey).toArray();
}

export function getSeriesByGroupKeys(groupKeys: readonly string[], limit: number): Promise<Series[]> {
  if (groupKeys.length === 0) return Promise.resolve([]);
  return db.xtream_series
    .where('groupKey')
    .anyOf([...groupKeys])
    .filter((s) => s.groupRank === 0)
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

/** Repartition des films/series par variante de langue (reglages / diagnostic). */
export async function countByVariant(section: 'vod' | 'series'): Promise<Record<MediaVariant, number>> {
  const table = section === 'vod' ? db.xtream_vod_streams : db.xtream_series;
  const out: Record<MediaVariant, number> = { VF: 0, MULTI: 0, VOSTFR: 0, VO: 0, OTHER: 0 };
  await Promise.all(
    (Object.keys(out) as MediaVariant[]).map(async (v) => {
      out[v] = await table.where('variant').equals(v).count();
    }),
  );
  return out;
}

// --- Navigation A PLAT (chantiers 1-2 : tiers par langue, dedup, filtres TMDB) --------

/** Tri global d'une collection a plat. `rating`/`year` = TMDB si enrichi, sinon fournisseur. */
export type FlatSort = 'recent' | 'rating' | 'year' | 'title';

/**
 * Pill de langue : 'all' = une carte par titre (version representative,
 * tiers dans l'ordre de preference) ; un couloir = une carte par titre
 * disponible dans ce couloir (VF+MULTI / VOSTFR / VO).
 */
export type LaneFilter = 'all' | AudioLane;

/**
 * Filtres frontend appliques sur TOUTE la collection, independamment des
 * categories fournisseur. Tous optionnels et cumulatifs (ET entre criteres) ; les
 * genres sont en OU (au moins un). Annee/note s'appuient sur `yearSort` /
 * `ratingSort` (TMDB si enrichi, sinon fournisseur).
 */
export interface CatalogFilter {
  /** Genres TMDB filtres. Vide/omis = pas de filtre genre. */
  genreIds?: number[];
  /** 'any' (OU, defaut) : au moins un genre ; 'all' (ET) : tous les genres. */
  genreMatch?: 'any' | 'all';
  /** Annee minimale / maximale (inclusives). */
  minYear?: number;
  maxYear?: number;
  /** Note minimale (/10). */
  minRating?: number;
  /** Pseudo-filtre « Autres / Non classes » : items sans correspondance TMDB (tmdbState=2). */
  unclassifiedOnly?: boolean;
}

/** Curseur de pagination multi-tiers (opaque pour l'UI). */
export interface PageCursor {
  tier: number;
  offset: number;
}

export const FIRST_PAGE: PageCursor = { tier: 0, offset: 0 };

export interface CatalogPage<T> {
  items: T[];
  /** null = plus rien a charger. */
  next: PageCursor | null;
}

/** Champs minimaux lus par le predicat de filtrage (films et series). */
interface TmdbFilterable {
  categoryId: string;
  tmdbGenreIds: number[];
  yearSort: number;
  ratingSort: number;
  tmdbState: number;
}

function isEmptyFilter(f: CatalogFilter): boolean {
  return (
    (f.genreIds === undefined || f.genreIds.length === 0) &&
    f.minYear === undefined &&
    f.maxYear === undefined &&
    f.minRating === undefined &&
    f.unclassifiedOnly !== true
  );
}

function buildPredicate(
  filter: CatalogFilter,
  hidden?: ReadonlySet<string>,
): ((item: TmdbFilterable) => boolean) | null {
  if (isEmptyFilter(filter) && (hidden === undefined || hidden.size === 0)) return null;
  const genreIds = filter.genreIds ?? [];
  const genreAll = filter.genreMatch === 'all';
  return (item) => {
    if (hidden !== undefined && hidden.has(item.categoryId)) return false;
    if (filter.unclassifiedOnly === true && item.tmdbState !== 2) return false;
    if (genreIds.length > 0) {
      const ok = genreAll
        ? genreIds.every((g) => item.tmdbGenreIds.includes(g))
        : genreIds.some((g) => item.tmdbGenreIds.includes(g));
      if (!ok) return false;
    }
    if (filter.minYear !== undefined && (item.yearSort === 0 || item.yearSort < filter.minYear)) return false;
    if (filter.maxYear !== undefined && (item.yearSort === 0 || item.yearSort > filter.maxYear)) return false;
    if (filter.minRating !== undefined && item.ratingSort < filter.minRating) return false;
    return true;
  };
}

type RecentField = 'addedAt' | 'lastModifiedAt';

function sortField(sort: FlatSort, recent: RecentField): string {
  if (sort === 'rating') return 'ratingSort';
  if (sort === 'year') return 'yearSort';
  if (sort === 'title') return 'titleKey'; // titre nettoye (+annee), pas le nom brut
  return recent;
}

/**
 * Collections d'index (« tiers ») a enchainer pour une vue. Chaque tier est
 * une PLAGE d'index composee : Dexie parcourt l'index dans l'ordre et ne
 * materialise que les lignes demandees. 'all' + tri non alphabetique =
 * un tier par variante dans l'ordre de preference (VF d'abord, etc.).
 */
function tiersFor<T>(
  table: Table<T, string>,
  recent: RecentField,
  lane: LaneFilter,
  order: readonly MediaVariant[],
  sort: FlatSort,
): Collection<T, string>[] {
  const field = sortField(sort, recent);
  const reverse = sort !== 'title';
  const range = (index: string, prefix: unknown[]): Collection<T, string> => {
    const c = table.where(index).between([...prefix, Dexie.minKey], [...prefix, Dexie.maxKey], true, true);
    return reverse ? c.reverse() : c;
  };
  if (lane === 'all') {
    if (sort === 'title') return [range('[groupRank+titleKey]', [0])];
    return order.map((variant) => range(`[groupRank+variant+${field}]`, [0, variant]));
  }
  return [range(`[laneRank+lane+${field}]`, [0, lane])];
}

/** Page a cheval sur plusieurs tiers (curseur = tier courant + offset dans ce tier). */
async function pageTiers<T>(
  tiers: Collection<T, string>[],
  cursor: PageCursor,
  limit: number,
  predicate: ((item: T) => boolean) | null,
): Promise<CatalogPage<T>> {
  const items: T[] = [];
  let tier = cursor.tier;
  let offset = cursor.offset;
  while (tier < tiers.length && items.length < limit) {
    const need = limit - items.length;
    const base = tiers[tier];
    if (base === undefined) break;
    const coll = predicate !== null ? base.filter(predicate) : base;
    const rows = await coll.offset(offset).limit(need).toArray();
    items.push(...rows);
    if (rows.length < need) {
      tier += 1;
      offset = 0;
    } else {
      offset += rows.length;
    }
  }
  return { items, next: tier < tiers.length ? { tier, offset } : null };
}

/** Rail borne : N par tier puis fusion par cle de tri decroissante (jamais de scan). */
async function mergeTiers<T>(
  tiers: Collection<T, string>[],
  limit: number,
  keyOf: (item: T) => number,
  predicate: ((item: T) => boolean) | null,
): Promise<T[]> {
  const lists = await Promise.all(
    tiers.map((base) => (predicate !== null ? base.filter(predicate) : base).limit(limit).toArray()),
  );
  return lists
    .flat()
    .sort((a, b) => keyOf(b) - keyOf(a))
    .slice(0, limit);
}

/**
 * Page de films sur TOUTE la collection (« data flattening ») : tiers d'index +
 * filtres TMDB en `.filter()` + curseur. Une carte par titre. Memoire bornee.
 */
export function getAllMoviesPage(
  cursor: PageCursor,
  limit: number,
  sort: FlatSort = 'recent',
  lane: LaneFilter = 'all',
  order: readonly MediaVariant[] = DEFAULT_VARIANT_ORDER,
  filter: CatalogFilter = {},
  hidden?: ReadonlySet<string>,
): Promise<CatalogPage<Movie>> {
  return pageTiers(
    tiersFor(db.xtream_vod_streams, 'addedAt', lane, order, sort),
    cursor,
    limit,
    buildPredicate(filter, hidden),
  );
}

/** Page de series sur toute la collection (voir getAllMoviesPage). */
export function getAllSeriesPage(
  cursor: PageCursor,
  limit: number,
  sort: FlatSort = 'recent',
  lane: LaneFilter = 'all',
  order: readonly MediaVariant[] = DEFAULT_VARIANT_ORDER,
  filter: CatalogFilter = {},
  hidden?: ReadonlySet<string>,
): Promise<CatalogPage<Series>> {
  return pageTiers(
    tiersFor(db.xtream_series, 'lastModifiedAt', lane, order, sort),
    cursor,
    limit,
    buildPredicate(filter, hidden),
  );
}

/**
 * Compte les titres (dedoublonnes) d'une vue. Sans filtre ni blacklist ->
 * compte d'index (rapide). Avec filtre -> parcours des lignes de la vue : a
 * utiliser avec parcimonie (pas a chaque frappe/scroll).
 */
export async function countAllMovies(
  lane: LaneFilter = 'all',
  filter: CatalogFilter = {},
  hidden?: ReadonlySet<string>,
): Promise<number> {
  const predicate = buildPredicate(filter, hidden);
  const tiers = tiersFor(db.xtream_vod_streams, 'addedAt', lane, DEFAULT_VARIANT_ORDER, 'title');
  const counts = await Promise.all(tiers.map((t) => (predicate !== null ? t.filter(predicate) : t).count()));
  return counts.reduce((a, b) => a + b, 0);
}

export async function countAllSeries(
  lane: LaneFilter = 'all',
  filter: CatalogFilter = {},
  hidden?: ReadonlySet<string>,
): Promise<number> {
  const predicate = buildPredicate(filter, hidden);
  const tiers = tiersFor(db.xtream_series, 'lastModifiedAt', lane, DEFAULT_VARIANT_ORDER, 'title');
  const counts = await Promise.all(tiers.map((t) => (predicate !== null ? t.filter(predicate) : t).count()));
  return counts.reduce((a, b) => a + b, 0);
}

// --- Rails bornes (accueil, classement) : une carte par titre, jamais de scan --------

/** Films recemment ajoutes, toutes variantes dans l'ordre de preference, fusion par date. */
export function getRecentMovies(limit: number, order: readonly MediaVariant[] = DEFAULT_VARIANT_ORDER): Promise<Movie[]> {
  return mergeTiers(tiersFor(db.xtream_vod_streams, 'addedAt', 'all', order, 'recent'), limit, (m) => m.addedAt ?? 0, null);
}

/** Films les mieux notes (TMDB sinon fournisseur), une carte par titre. */
export function getTopRatedMovies(limit: number, order: readonly MediaVariant[] = DEFAULT_VARIANT_ORDER): Promise<Movie[]> {
  return mergeTiers(tiersFor(db.xtream_vod_streams, 'addedAt', 'all', order, 'rating'), limit, (m) => m.ratingSort, null);
}

/** Films en AUDIO FRANCAIS (VF/MULTI), meilleure version par titre. */
export function getFrenchMovies(limit: number, sort: 'recent' | 'rating' = 'recent'): Promise<Movie[]> {
  const [tier] = tiersFor(db.xtream_vod_streams, 'addedAt', 'fr', DEFAULT_VARIANT_ORDER, sort);
  return tier === undefined ? Promise.resolve([]) : tier.limit(limit).toArray();
}

export function getRecentSeries(limit: number, order: readonly MediaVariant[] = DEFAULT_VARIANT_ORDER): Promise<Series[]> {
  return mergeTiers(
    tiersFor(db.xtream_series, 'lastModifiedAt', 'all', order, 'recent'),
    limit,
    (s) => s.lastModifiedAt ?? 0,
    null,
  );
}

export function getTopRatedSeries(limit: number, order: readonly MediaVariant[] = DEFAULT_VARIANT_ORDER): Promise<Series[]> {
  return mergeTiers(tiersFor(db.xtream_series, 'lastModifiedAt', 'all', order, 'rating'), limit, (s) => s.ratingSort, null);
}

export function getFrenchSeries(limit: number, sort: 'recent' | 'rating' = 'recent'): Promise<Series[]> {
  const [tier] = tiersFor(db.xtream_series, 'lastModifiedAt', 'fr', DEFAULT_VARIANT_ORDER, sort);
  return tier === undefined ? Promise.resolve([]) : tier.limit(limit).toArray();
}

/**
 * Recherche BORNEE pour les rails d'accueil (genre, « parce que tu as regarde »,
 * favoris...) : parcourt les tiers d'index (une version par titre, variante
 * preferee d'abord, tri note ou date) en appliquant `predicate`, et s'arrete a
 * `limit` resultats OU apres `scanCap` lignes lues. Jamais de scan complet,
 * meme pour un genre rare.
 */
async function findInTiers<T>(
  tiers: Collection<T, string>[],
  limit: number,
  predicate: (item: T) => boolean,
  scanCap: number,
): Promise<T[]> {
  const out: T[] = [];
  let scanned = 0;
  for (const tier of tiers) {
    if (out.length >= limit || scanned >= scanCap) break;
    const rows = await tier
      .until(() => scanned >= scanCap)
      .filter((item) => {
        scanned += 1;
        return predicate(item);
      })
      .limit(limit - out.length)
      .toArray();
    out.push(...rows);
  }
  return out;
}

const RAIL_SCAN_CAP = 4000;

export function findMovies(
  predicate: (m: Movie) => boolean,
  limit: number,
  order: readonly MediaVariant[] = DEFAULT_VARIANT_ORDER,
  sort: 'rating' | 'recent' = 'rating',
  scanCap = RAIL_SCAN_CAP,
): Promise<Movie[]> {
  return findInTiers(tiersFor(db.xtream_vod_streams, 'addedAt', 'all', order, sort), limit, predicate, scanCap);
}

export function findSeries(
  predicate: (s: Series) => boolean,
  limit: number,
  order: readonly MediaVariant[] = DEFAULT_VARIANT_ORDER,
  sort: 'rating' | 'recent' = 'rating',
  scanCap = RAIL_SCAN_CAP,
): Promise<Series[]> {
  return findInTiers(tiersFor(db.xtream_series, 'lastModifiedAt', 'all', order, sort), limit, predicate, scanCap);
}

// --- Recherche (index multiEntry searchTokens, schema v2) ---------------------------

interface Searchable {
  id: string;
  name: string;
  normalizedName: string;
  categoryId: string;
  isFrench: BoolNum;
  searchTokens: string[];
  /** Films/series : dedoublonnage par titre et priorite de langue. */
  groupKey?: string;
  groupRank?: number;
  variant?: MediaVariant;
}

/**
 * Recherche par prefixe de tokens via l'index multiEntry : le token le plus
 * long passe par l'index, les autres filtrent les candidats. Jamais de scan
 * complet de la table.
 *
 * `hiddenCategoryIds` : categories blacklistees exclues DANS le `.filter()`,
 * donc AVANT `.limit()` — sinon une grosse categorie masquee raflerait les N
 * premiers resultats et ferait disparaitre des correspondances legitimes.
 *
 * Films/series : les VERSIONS d'un meme titre sont dedoublonnees (une seule
 * carte, la version representative puis la variante preferee en tete).
 */
async function searchIn<T extends Searchable>(
  table: Table<T, string>,
  query: string,
  limit: number,
  hiddenCategoryIds?: ReadonlySet<string>,
  extra?: (item: T) => boolean,
  order: readonly MediaVariant[] = DEFAULT_VARIANT_ORDER,
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
        rest.every((t) => item.searchTokens.some((tok) => tok.startsWith(t))) &&
        (extra === undefined || extra(item)),
    )
    .limit(limit * 3)
    .toArray();

  const nq = normalizeText(query);
  rows.sort(
    (a, b) =>
      Number(b.normalizedName.startsWith(nq)) - Number(a.normalizedName.startsWith(nq)) ||
      (a.groupRank ?? 0) - (b.groupRank ?? 0) ||
      (a.variant !== undefined && b.variant !== undefined ? variantRank(a.variant, order) - variantRank(b.variant, order) : 0) ||
      b.isFrench - a.isFrench ||
      a.name.localeCompare(b.name, 'fr'),
  );

  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    if (row.groupKey !== undefined) {
      if (seen.has(row.groupKey)) continue;
      seen.add(row.groupKey);
    }
    out.push(row);
    if (out.length >= limit) break;
  }
  return out;
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
  order: readonly MediaVariant[] = DEFAULT_VARIANT_ORDER,
): Promise<Movie[]> {
  return searchIn(db.xtream_vod_streams, query, limit, hiddenCategoryIds, undefined, order);
}

export function searchSeries(
  query: string,
  limit = 60,
  hiddenCategoryIds?: ReadonlySet<string>,
  order: readonly MediaVariant[] = DEFAULT_VARIANT_ORDER,
): Promise<Series[]> {
  return searchIn(db.xtream_series, query, limit, hiddenCategoryIds, undefined, order);
}

function laneAnd<T extends TmdbFilterable & { lane: AudioLane }>(
  lane: LaneFilter,
  predicate: ((item: T) => boolean) | null,
): ((item: T) => boolean) | undefined {
  if (lane === 'all') return predicate ?? undefined;
  return (item) => item.lane === lane && (predicate === null || predicate(item));
}

/**
 * Recherche films CROISEE avec la pill de langue et les filtres TMDB. Le texte
 * passe par l'index searchTokens ; couloir + filtre s'appliquent dans le meme
 * `.filter()` (avant `.limit()`). Le tri de pertinence de searchIn prime.
 */
export function searchMoviesFiltered(
  query: string,
  lane: LaneFilter = 'all',
  order: readonly MediaVariant[] = DEFAULT_VARIANT_ORDER,
  filter: CatalogFilter = {},
  limit = 60,
  hiddenCategoryIds?: ReadonlySet<string>,
): Promise<Movie[]> {
  return searchIn(db.xtream_vod_streams, query, limit, hiddenCategoryIds, laneAnd(lane, buildPredicate(filter)), order);
}

export function searchSeriesFiltered(
  query: string,
  lane: LaneFilter = 'all',
  order: readonly MediaVariant[] = DEFAULT_VARIANT_ORDER,
  filter: CatalogFilter = {},
  limit = 60,
  hiddenCategoryIds?: ReadonlySet<string>,
): Promise<Series[]> {
  return searchIn(db.xtream_series, query, limit, hiddenCategoryIds, laneAnd(lane, buildPredicate(filter)), order);
}

// --- Regroupement des versions (chantier 2) --------------------------------------

/** Projection minimale d'une ligne pour le calcul des rangs (memoire legere). */
export interface GroupRow {
  id: string;
  groupKey: string;
  variant: MediaVariant;
  lane: AudioLane;
  qualityScore: number;
  container: string | null;
  groupRank: number;
  laneRank: number;
}

export interface RankUpdate {
  key: string;
  changes: { groupRank: number; laneRank: number };
}

function projectMovie(m: Movie): GroupRow {
  return {
    id: m.id,
    groupKey: m.groupKey,
    variant: m.variant,
    lane: m.lane,
    qualityScore: m.qualityScore,
    container: m.containerExtension,
    groupRank: m.groupRank,
    laneRank: m.laneRank,
  };
}

function projectSeries(s: Series): GroupRow {
  return {
    id: s.id,
    groupKey: s.groupKey,
    variant: s.variant,
    lane: s.lane,
    qualityScore: s.qualityScore,
    container: null,
    groupRank: s.groupRank,
    laneRank: s.laneRank,
  };
}

/** Parcours curseur de TOUS les films, projection minimale (jamais le tableau complet). */
export async function scanMovieGroupRows(onRow: (row: GroupRow) => void): Promise<void> {
  await db.xtream_vod_streams.each((m) => onRow(projectMovie(m)));
}

export async function scanSeriesGroupRows(onRow: (row: GroupRow) => void): Promise<void> {
  await db.xtream_series.each((s) => onRow(projectSeries(s)));
}

export async function getMovieGroupRows(groupKey: string): Promise<GroupRow[]> {
  return (await getMoviesByGroupKey(groupKey)).map(projectMovie);
}

export async function getSeriesGroupRows(groupKey: string): Promise<GroupRow[]> {
  return (await getSeriesByGroupKey(groupKey)).map(projectSeries);
}

const RANK_CHUNK = 1000;

/** Ecriture par lots des rangs (seules les lignes qui changent sont transmises). */
async function inChunks(updates: readonly RankUpdate[], write: (chunk: RankUpdate[]) => Promise<unknown>): Promise<void> {
  for (let i = 0; i < updates.length; i += RANK_CHUNK) await write(updates.slice(i, i + RANK_CHUNK));
}

export function bulkUpdateMovieRanks(updates: readonly RankUpdate[]): Promise<void> {
  return inChunks(updates, (chunk) =>
    db.xtream_vod_streams.bulkUpdate(chunk.map((u) => ({ key: u.key, changes: u.changes as UpdateSpec<Movie> }))),
  );
}

export function bulkUpdateSeriesRanks(updates: readonly RankUpdate[]): Promise<void> {
  return inChunks(updates, (chunk) =>
    db.xtream_series.bulkUpdate(chunk.map((u) => ({ key: u.key, changes: u.changes as UpdateSpec<Series> }))),
  );
}

// --- Enrichissement TMDB (refonte VOD, etape 1 ; file priorisee chantier 3) ----

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

/** Cles de groupe avant/apres enrichissement (re-classement incremental). */
export interface TmdbEnrichOutcome {
  previousGroupKey: string;
  groupKey: string;
}

function pendingTiers<T>(table: Table<T, string>, recent: RecentField, order: readonly MediaVariant[]): Collection<T, string>[] {
  return order.map((variant) =>
    table
      .where(`[tmdbState+variant+${recent}]`)
      .between([0, variant, Dexie.minKey], [0, variant, Dexie.maxKey], true, true)
      .reverse(),
  );
}

/** Prochain lot de films en attente d'enrichissement : variante preferee puis plus recents d'abord. */
export async function getMoviesNeedingTmdb(limit: number, order: readonly MediaVariant[] = DEFAULT_VARIANT_ORDER): Promise<Movie[]> {
  return (await pageTiers(pendingTiers(db.xtream_vod_streams, 'addedAt', order), FIRST_PAGE, limit, null)).items;
}

/** Prochain lot de series en attente d'enrichissement (meme priorite). */
export async function getSeriesNeedingTmdb(limit: number, order: readonly MediaVariant[] = DEFAULT_VARIANT_ORDER): Promise<Series[]> {
  return (await pageTiers(pendingTiers(db.xtream_series, 'lastModifiedAt', order), FIRST_PAGE, limit, null)).items;
}

export function countMoviesNeedingTmdb(): Promise<number> {
  return db.xtream_vod_streams.where('tmdbState').equals(0).count();
}

export function countSeriesNeedingTmdb(): Promise<number> {
  return db.xtream_series.where('tmdbState').equals(0).count();
}

/**
 * Write-back TMDB sur un film : met aussi a jour les champs DERIVES
 * (`groupKey` par id TMDB, `ratingSort`, `yearSort`). Renvoie les cles de groupe
 * avant/apres pour le re-classement incremental, null si la ligne a disparu.
 */
export async function updateMovieTmdb(id: string, patch: TmdbEnrichPatch): Promise<TmdbEnrichOutcome | null> {
  const row = await db.xtream_vod_streams.get(id);
  if (row === undefined) return null;
  const tmdbId = patch.tmdbId === undefined ? row.tmdbId : patch.tmdbId;
  const groupKey = tmdbId !== null ? tmdbGroupKey(tmdbId) : row.titleKey;
  const changes: UpdateSpec<Movie> = {
    ...patch,
    groupKey,
    ratingSort: patch.tmdbRating ?? row.rating ?? 0,
    yearSort: patch.tmdbYear ?? row.year ?? 0,
  };
  await db.xtream_vod_streams.update(id, changes);
  return { previousGroupKey: row.groupKey, groupKey };
}

/** Write-back TMDB sur une serie (voir updateMovieTmdb). */
export async function updateSeriesTmdb(id: string, patch: TmdbEnrichPatch): Promise<TmdbEnrichOutcome | null> {
  const row = await db.xtream_series.get(id);
  if (row === undefined) return null;
  const tmdbId = patch.tmdbId === undefined ? row.tmdbId : patch.tmdbId;
  const groupKey = tmdbId !== null ? tmdbGroupKey(tmdbId) : row.titleKey;
  const changes: UpdateSpec<Series> = {
    ...patch,
    groupKey,
    ratingSort: patch.tmdbRating ?? row.rating ?? 0,
    yearSort: patch.tmdbYear ?? row.year ?? 0,
  };
  await db.xtream_series.update(id, changes);
  return { previousGroupKey: row.groupKey, groupKey };
}
