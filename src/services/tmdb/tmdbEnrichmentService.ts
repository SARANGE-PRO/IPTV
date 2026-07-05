import * as catalogRepository from '@/db/repositories/catalogRepository';
import type { TmdbEnrichPatch } from '@/db/repositories/catalogRepository';
import * as tmdbRepository from '@/db/repositories/tmdbRepository';
import type { Movie, Series, TmdbMetadata } from '@/types/models';
import { enrichByTmdbId, enrichMovie, enrichSeries, tmdbCacheKey } from './tmdbMatcher';

/**
 * MOTEUR d'enrichissement TMDB du catalogue (refonte VOD, etape 1).
 *
 * Deux modes, meme brique unitaire :
 *  - « a la demande » : `enrichVisibleMovies/Series` enrichit ce que la
 *    pagination vient d'afficher (branche a l'UI en etape 2) ;
 *  - « backfill silencieux » : `runCatalogBackfill` traite le reste du catalogue
 *    par lots, en menageant le quota du proxy (60 req/min/IP).
 *
 * Strategie de matching (decision produit) : `tmdbId` fourni par le panel EN
 * PRIORITE ABSOLUE (1 requete, fiable) ; fallback titre nettoye + annee sinon.
 * Un item sans correspondance passe en `tmdbState = 2` (orphelin « Autres »),
 * jamais perdu. Idempotent et REPRENABLE : l'etat vit sur la ligne Dexie, donc
 * un rechargement d'app poursuit la ou on s'etait arrete.
 *
 * Best-effort : ne jette jamais vers l'appelant. En cas d'echec reseau, la ligne
 * reste en `tmdbState = 0` et sera retentee au prochain passage.
 */

// Le DEBIT est desormais garanti par le limiteur de tmdbClient (>= 1,15 s entre
// appels proxy, ~52 req/min < 60). Ici on ne gere plus le rythme fin : lots de
// 12, concurrence 4 pour masquer la latence reseau dans le creneau, petite pause
// entre les tours. Un 429 residuel est deja absorbe (backoff) cote client.
const BACKFILL_BATCH = 12;
const CONCURRENCY = 4;
const BATCH_PAUSE_MS = 500;
/**
 * Tours consecutifs SANS progression avant d'abandonner. Genereux : une accalmie
 * (429 en backoff, TMDB lent) fait PATIENTER (backoff exponentiel ci-dessous) et
 * REPREND les memes lignes au tour suivant — on n'abandonne un item que si TMDB
 * reste injoignable sur toute la fenetre. Les lignes restent en tmdbState=0 et
 * seront reprises au prochain lancement du backfill.
 */
const MAX_STALL = 6;
/** Plafond du backoff quand ca stagne (ms). */
const STALL_BACKOFF_CAP_MS = 30_000;

/** Verrou par ligne : evite qu'« a la demande » et backfill enrichissent 2x le meme id. */
const inFlight = new Set<string>();

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
): Promise<void> {
  await tmdbRepository.putTmdbEntry({
    key: tmdbCacheKey(type, rawName),
    type,
    status: meta !== null ? 'found' : 'notfound',
    data: meta,
    fetchedAt: Date.now(),
  });
}

async function resolveMeta(
  type: 'movie' | 'tv',
  tmdbId: number | null,
  name: string,
  year: number | null,
): Promise<TmdbMetadata | null> {
  // 1) tmdbId du panel = priorite absolue (fiable, 1 seule requete).
  if (tmdbId !== null) {
    const byId = await enrichByTmdbId(type, tmdbId);
    if (byId !== null) return byId;
  }
  // 2) fallback : matching titre propre + annee.
  return type === 'movie' ? enrichMovie(name, year) : enrichSeries(name, year);
}

/** Enrichit un film. Renvoie true si l'etat a progresse (0 -> 1|2), false si echec. */
async function enrichMovieRowInternal(movie: Movie, force = false): Promise<boolean> {
  if (!force && movie.tmdbState !== 0) return false;
  const lock = `movie:${movie.id}`;
  if (inFlight.has(lock)) return false;
  inFlight.add(lock);
  try {
    const meta = await resolveMeta('movie', movie.tmdbId, movie.name, movie.year);
    await catalogRepository.updateMovieTmdb(movie.id, toPatch(meta, movie.tmdbId));
    await mirrorToDetailCache('movie', movie.name, meta);
    return true;
  } catch {
    return false; // reste en attente (tmdbState = 0), retente plus tard
  } finally {
    inFlight.delete(lock);
  }
}

/** Enrichit une serie. Renvoie true si l'etat a progresse. */
async function enrichSeriesRowInternal(series: Series, force = false): Promise<boolean> {
  if (!force && series.tmdbState !== 0) return false;
  const lock = `series:${series.id}`;
  if (inFlight.has(lock)) return false;
  inFlight.add(lock);
  try {
    const meta = await resolveMeta('tv', series.tmdbId, series.name, yearOf(series.releaseDate));
    await catalogRepository.updateSeriesTmdb(series.id, toPatch(meta, series.tmdbId));
    await mirrorToDetailCache('tv', series.name, meta);
    return true;
  } catch {
    return false;
  } finally {
    inFlight.delete(lock);
  }
}

/** Pool a concurrence bornee. Renvoie le nombre de succes. */
async function runPool<T>(
  items: T[],
  worker: (item: T) => Promise<boolean>,
  signal?: AbortSignal,
): Promise<number> {
  let index = 0;
  let ok = 0;
  const runners = Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (index < items.length) {
      if (signal?.aborted) return;
      const item = items[index++];
      if (item !== undefined && (await worker(item))) ok += 1;
    }
  });
  await Promise.all(runners);
  return ok;
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

// --- API « a la demande » (branchee a la pagination en etape 2) ----------------

/** Enrichit les films d'une page qui ne le sont pas encore (non bloquant). */
export async function enrichVisibleMovies(movies: Movie[]): Promise<void> {
  const pending = movies.filter((m) => m.tmdbState === 0);
  if (pending.length > 0) await runPool(pending, (m) => enrichMovieRowInternal(m));
}

/** Enrichit les series d'une page qui ne le sont pas encore (non bloquant). */
export async function enrichVisibleSeries(series: Series[]): Promise<void> {
  const pending = series.filter((s) => s.tmdbState === 0);
  if (pending.length > 0) await runPool(pending, (s) => enrichSeriesRowInternal(s));
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
 * Traite tout le catalogue en attente (films puis series) par lots, jusqu'a la
 * file vide, l'annulation, ou `MAX_STALL` tours sans progres (TMDB HS). Un seul
 * backfill a la fois. A appeler apres la sync (branchement en etape 2).
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

  try {
    while (!signal.aborted) {
      const movies = await catalogRepository.getMoviesNeedingTmdb(BACKFILL_BATCH);
      const series =
        movies.length < BACKFILL_BATCH
          ? await catalogRepository.getSeriesNeedingTmdb(BACKFILL_BATCH - movies.length)
          : [];
      if (movies.length === 0 && series.length === 0) break; // file vide -> termine

      const ok =
        (await runPool(movies, (m) => enrichMovieRowInternal(m), signal)) +
        (await runPool(series, (s) => enrichSeriesRowInternal(s), signal));
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
        // PATIENTE de plus en plus longtemps, sans abandonner les lignes (elles
        // restent en tmdbState=0 et repassent au tour suivant).
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
