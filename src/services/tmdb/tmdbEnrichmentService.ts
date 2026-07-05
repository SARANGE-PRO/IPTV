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

// Lots volontairement conservateurs : chaque item = 1 requete (voie tmdbId) a 2
// (voie titre : recherche + detail, + eventuel retry). Concurrence 4 + pause de
// 1,5 s entre les tours -> on reste sous 60 req/min meme dans le pire cas.
const BACKFILL_BATCH = 12;
const CONCURRENCY = 4;
const BATCH_PAUSE_MS = 1500;
/** Nombre de tours SANS aucune progression avant d'abandonner (TMDB HS). */
const MAX_STALL = 2;

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

      if (ok === 0) {
        stall += 1;
        if (stall >= MAX_STALL) break; // aucun progres : on abandonne, on retentera au prochain lancement
      } else {
        stall = 0;
      }

      if (opts?.onProgress !== undefined) {
        const [moviesLeft, seriesLeft] = await Promise.all([
          catalogRepository.countMoviesNeedingTmdb(),
          catalogRepository.countSeriesNeedingTmdb(),
        ]);
        opts.onProgress({ moviesLeft, seriesLeft, processed });
      }

      if (signal.aborted) break;
      await sleep(BATCH_PAUSE_MS, signal);
    }
  } finally {
    backfillRunning = false;
    controller = null;
  }
}
