import { CACHE_TTL } from '@/config/constants';
import * as catalogRepository from '@/db/repositories/catalogRepository';
import type { TmdbEnrichOutcome, TmdbEnrichPatch } from '@/db/repositories/catalogRepository';
import * as tmdbRepository from '@/db/repositories/tmdbRepository';
import { loadPreferredLanguage, rerankGroups } from '@/services/catalog/catalogGroupingService';
import type { MediaVariant } from '@/types/mediaLanguage';
import type { Movie, Series, TmdbMetadata } from '@/types/models';
import { variantOrder } from '@/utils/variantPreference';
import { enrichByTmdbId, enrichMovieLite, enrichSeriesLite, tmdbCacheKey } from './tmdbMatcher';
import { isLowBandwidth } from '@/services/network/lowBandwidthService';
import { isPlaybackActive, whenPlaybackIdle } from '@/services/player/playbackActivity';

/**
 * MOTEUR d'enrichissement TMDB du catalogue (refonte VOD, etape 1 ; fiabilise
 * au chantier 3).
 *
 * Deux modes, meme brique unitaire :
 *  - « a la demande » : `enrichVisibleMovies/Series` enrichit ce que la
 *    pagination vient d'afficher ;
 *  - « backfill silencieux » : `runCatalogBackfill` traite le reste du
 *    catalogue par lots, lance par catalogStore AU DEMARRAGE et apres sync.
 *
 * Chantier 3 :
 *  - FILE PRIORISEE : variante preferee d'abord (VF, puis MULTI…), plus recents
 *    en tete — le contenu qu'on regarde vraiment est enrichi en premier ;
 *  - ENRICHISSEMENT ALLEGE : sans id TMDB du panel, UNE requete de recherche
 *    suffit (genres, annee, note, affiche) ; la fiche detail complete casting
 *    et duree a l'ouverture (cache `partial`). Avec id du panel : 1 requete
 *    detail, complete ;
 *  - RE-CLASSEMENT : une ligne qui recoit son id TMDB rejoint le groupe de ses
 *    versions soeurs (cle `t:<id>`) -> rangs recalcules pour l'ancien et le
 *    nouveau groupe, en incremental.
 *
 * Idempotent et REPRENABLE : l'etat vit sur la ligne Dexie. Best-effort : ne
 * jette jamais vers l'appelant ; en cas d'echec reseau la ligne reste en
 * `tmdbState = 0` et sera retentee au prochain passage.
 */

// Le DEBIT est garanti par le limiteur de tmdbClient (intervalle minimal entre
// appels proxy, toute concurrence confondue). Ici : lots de 24, concurrence 4
// pour masquer la latence reseau, courte pause entre les tours.
const BACKFILL_BATCH = 24;
const CONCURRENCY = 4;
const BATCH_PAUSE_MS = 250;
/**
 * Tours consecutifs SANS progression avant d'abandonner. Genereux : une accalmie
 * (429 en backoff, TMDB lent) fait PATIENTER (backoff exponentiel ci-dessous) et
 * REPREND les memes lignes au tour suivant — on n'abandonne un item que si TMDB
 * reste injoignable sur toute la fenetre.
 */
const MAX_STALL = 6;
/** Plafond du backoff quand ca stagne (ms). */
const STALL_BACKOFF_CAP_MS = 30_000;

/** Verrou par ligne : evite qu'« a la demande » et backfill enrichissent 2x le meme id. */
const inFlight = new Set<string>();

/** Reessai d'un « introuvable » (cache negatif) apres 3 j — aligne sur tmdbCacheService. */
const NEGATIVE_RETRY_MS = 1000 * 60 * 60 * 24 * 3;

interface ResolveResult {
  meta: TmdbMetadata | null;
  /** false si servi depuis le cache TMDB (aucune requete reseau consommee). */
  fromNetwork: boolean;
  /** true si `meta` vient de la seule recherche (sans casting/duree). */
  partial: boolean;
}

function yearOf(releaseDate: string | null): number | null {
  if (releaseDate === null || releaseDate.length < 4) return null;
  const y = Number.parseInt(releaseDate.slice(0, 4), 10);
  return Number.isFinite(y) ? y : null;
}

function toPatch(meta: TmdbMetadata | null, existingTmdbId: number | null): TmdbEnrichPatch {
  if (meta === null) {
    // Aucune correspondance : orphelin. On conserve l'eventuel tmdbId du panel.
    return { tmdbId: existingTmdbId, tmdbGenreIds: [], tmdbYear: null, tmdbRating: null, tmdbState: 2 };
  }
  return {
    tmdbId: meta.tmdbId,
    tmdbGenreIds: meta.genreIds ?? [],
    tmdbYear: yearOf(meta.releaseDate),
    tmdbRating: meta.voteAverage,
    tmdbState: 1,
  };
}

/** Ecrit aussi dans tmdb_cache pour que la fiche detail beneficie du travail. */
async function mirrorToDetailCache(
  type: 'movie' | 'tv',
  rawName: string,
  meta: TmdbMetadata | null,
  partial: boolean,
): Promise<void> {
  await tmdbRepository.putTmdbEntry({
    key: tmdbCacheKey(type, rawName),
    type,
    status: meta !== null ? 'found' : 'notfound',
    data: meta,
    fetchedAt: Date.now(),
    partial: meta !== null && partial,
  });
}

async function resolveMeta(
  type: 'movie' | 'tv',
  tmdbId: number | null,
  name: string,
  year: number | null,
): Promise<ResolveResult> {
  // 0) CACHE TMDB d'abord. La table tmdb_cache survit au clear() du catalogue
  //    (resync) : un item deja enrichi est restitue SANS requete reseau -> une
  //    resync ne reconsomme pas le quota, l'enrichissement est "preserve".
  const key = tmdbCacheKey(type, name);
  const cached = await tmdbRepository.getTmdbEntry(key);
  if (cached !== undefined) {
    const age = Date.now() - cached.fetchedAt;
    if (cached.status === 'found' && age < CACHE_TTL.tmdb) {
      return { meta: cached.data, fromNetwork: false, partial: cached.partial === true };
    }
    if (cached.status === 'notfound' && age < NEGATIVE_RETRY_MS) return { meta: null, fromNetwork: false, partial: false };
  }
  // 1) tmdbId du panel = priorite absolue (fiable, 1 seule requete detail, complete).
  if (tmdbId !== null) {
    const meta = await enrichByTmdbId(type, tmdbId);
    if (meta !== null) return { meta, fromNetwork: true, partial: false };
  }
  // 2) fallback ALLEGE : recherche titre propre + annee, sans requete detail.
  const meta = type === 'movie' ? await enrichMovieLite(name, year) : await enrichSeriesLite(name, year);
  return { meta, fromNetwork: true, partial: true };
}

/** Resultat unitaire : a progresse ? + cles de groupe a re-classer (si changement). */
interface RowResult {
  ok: boolean;
  outcome: TmdbEnrichOutcome | null;
}

const NO_PROGRESS: RowResult = { ok: false, outcome: null };

/** Enrichit un film. `ok` = l'etat a progresse (0 -> 1|2). */
async function enrichMovieRowInternal(movie: Movie, force = false): Promise<RowResult> {
  if (!force && movie.tmdbState !== 0) return NO_PROGRESS;
  const lock = `movie:${movie.id}`;
  if (inFlight.has(lock)) return NO_PROGRESS;
  inFlight.add(lock);
  try {
    const { meta, fromNetwork, partial } = await resolveMeta('movie', movie.tmdbId, movie.name, movie.year);
    const outcome = await catalogRepository.updateMovieTmdb(movie.id, toPatch(meta, movie.tmdbId));
    if (fromNetwork) await mirrorToDetailCache('movie', movie.name, meta, partial);
    return { ok: true, outcome };
  } catch {
    return NO_PROGRESS; // reste en attente (tmdbState = 0), retente plus tard
  } finally {
    inFlight.delete(lock);
  }
}

/** Enrichit une serie. */
async function enrichSeriesRowInternal(series: Series, force = false): Promise<RowResult> {
  if (!force && series.tmdbState !== 0) return NO_PROGRESS;
  const lock = `series:${series.id}`;
  if (inFlight.has(lock)) return NO_PROGRESS;
  inFlight.add(lock);
  try {
    const { meta, fromNetwork, partial } = await resolveMeta('tv', series.tmdbId, series.name, series.year);
    const outcome = await catalogRepository.updateSeriesTmdb(series.id, toPatch(meta, series.tmdbId));
    if (fromNetwork) await mirrorToDetailCache('tv', series.name, meta, partial);
    return { ok: true, outcome };
  } catch {
    return NO_PROGRESS;
  } finally {
    inFlight.delete(lock);
  }
}

/** Pool a concurrence bornee. Renvoie le nombre de succes et les cles a re-classer. */
async function runPool<T>(
  items: T[],
  worker: (item: T) => Promise<RowResult>,
  signal?: AbortSignal,
): Promise<{ ok: number; keys: string[] }> {
  let index = 0;
  let ok = 0;
  const keys: string[] = [];
  const runners = Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (index < items.length) {
      if (signal?.aborted) return;
      const item = items[index++];
      if (item === undefined) continue;
      const result = await worker(item);
      if (result.ok) ok += 1;
      const o = result.outcome;
      if (o !== null && o.groupKey !== o.previousGroupKey) keys.push(o.previousGroupKey, o.groupKey);
    }
  });
  await Promise.all(runners);
  return { ok, keys };
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const id = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(id);
        resolve();
      },
      { once: true },
    );
  });
}

/** Re-classement incremental best-effort des groupes touches. */
async function rerank(section: 'vod' | 'series', keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  try {
    await rerankGroups(section, keys);
  } catch {
    // Les rangs precedents restent valides ; la prochaine passe complete corrigera.
  }
}

// --- API « a la demande » (branchee a la pagination) ---------------------------

/** Enrichit les films d'une page qui ne le sont pas encore (non bloquant). */
export async function enrichVisibleMovies(movies: Movie[]): Promise<void> {
  const pending = movies.filter((m) => m.tmdbState === 0);
  if (pending.length === 0) return;
  const { keys } = await runPool(pending, (m) => enrichMovieRowInternal(m));
  await rerank('vod', keys);
}

/** Enrichit les series d'une page qui ne le sont pas encore (non bloquant). */
export async function enrichVisibleSeries(series: Series[]): Promise<void> {
  const pending = series.filter((s) => s.tmdbState === 0);
  if (pending.length === 0) return;
  const { keys } = await runPool(pending, (s) => enrichSeriesRowInternal(s));
  await rerank('series', keys);
}

// --- Backfill silencieux -------------------------------------------------------

export interface BackfillProgress {
  /** Films restant a enrichir. */
  moviesLeft: number;
  /** Series restant a enrichir. */
  seriesLeft: number;
  /** Total enrichi durant CE run. */
  processed: number;
}

let backfillRunning = false;
let controller: AbortController | null = null;

export function isBackfillRunning(): boolean {
  return backfillRunning;
}

/** Interrompt proprement un backfill en cours (au prochain point d'annulation). */
export function stopCatalogBackfill(): void {
  controller?.abort();
}

/**
 * Traite tout le catalogue en attente (films puis series) par lots priorises,
 * jusqu'a la file vide, l'annulation, ou `MAX_STALL` tours sans progres (TMDB
 * HS). Un seul backfill a la fois.
 */
export async function runCatalogBackfill(opts?: {
  onProgress?: (progress: BackfillProgress) => void;
}): Promise<void> {
  if (backfillRunning) return;
  backfillRunning = true;
  controller = new AbortController();
  const { signal } = controller;
  let processed = 0;
  let stall = 0;
  let order: readonly MediaVariant[] = variantOrder(await loadPreferredLanguage());
  let round = 0;

  try {
    while (!signal.aborted) {
      // Connexion faible : on s'arrete ; la sortie du mode relance le backfill.
      if (isLowBandwidth()) break;
      // Lecture en cours : on attend sa fin (le debit va a la video, pas a TMDB).
      if (isPlaybackActive()) {
        await whenPlaybackIdle(signal);
        if (signal.aborted) break;
      }
      // La preference peut changer pendant un long run : relue periodiquement.
      if (round % 20 === 0) order = variantOrder(await loadPreferredLanguage());
      round += 1;

      const movies = await catalogRepository.getMoviesNeedingTmdb(BACKFILL_BATCH, order);
      const series =
        movies.length < BACKFILL_BATCH
          ? await catalogRepository.getSeriesNeedingTmdb(BACKFILL_BATCH - movies.length, order)
          : [];
      if (movies.length === 0 && series.length === 0) break; // file vide -> termine

      const m = await runPool(movies, (row) => enrichMovieRowInternal(row), signal);
      const s = await runPool(series, (row) => enrichSeriesRowInternal(row), signal);
      await rerank('vod', m.keys);
      await rerank('series', s.keys);
      const ok = m.ok + s.ok;
      processed += ok;

      if (opts?.onProgress !== undefined) {
        const [moviesLeft, seriesLeft] = await Promise.all([
          catalogRepository.countMoviesNeedingTmdb(),
          catalogRepository.countSeriesNeedingTmdb(),
        ]);
        opts.onProgress({ moviesLeft, seriesLeft, processed });
      }

      if (signal.aborted) break;

      if (ok === 0) {
        // Aucun item traite ce tour (probable 429 en backoff / TMDB lent) : on
        // PATIENTE de plus en plus longtemps, sans abandonner les lignes.
        stall += 1;
        if (stall >= MAX_STALL) break;
        await sleep(Math.min(BATCH_PAUSE_MS * 2 ** stall, STALL_BACKOFF_CAP_MS), signal);
      } else {
        stall = 0;
        await sleep(BATCH_PAUSE_MS, signal);
      }
    }
  } finally {
    backfillRunning = false;
    controller = null;
  }
}
