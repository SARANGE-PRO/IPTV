/** Client vers le proxy /api/tmdb. La cle reste cote serveur ; ici, aucun secret. */

export class TmdbError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'TmdbError';
  }
}

// --- Formes brutes TMDB (partielles) --------------------------------------------

export interface TmdbSearchItem {
  id: number;
  title?: string; // movie
  name?: string; // tv
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  release_date?: string; // movie
  first_air_date?: string; // tv
  vote_average?: number;
  /** genre_ids fournis des la recherche (fallback si le detail echoue). */
  genre_ids?: number[];
}

export interface TmdbGenreRaw {
  id: number;
  name: string;
}

interface TmdbGenreListResponse {
  genres?: TmdbGenreRaw[];
}

interface TmdbSearchResponse {
  results?: TmdbSearchItem[];
}

interface TmdbGenre {
  id: number;
  name: string;
}

interface TmdbCastRaw {
  name?: string;
  character?: string | null;
}

export interface TmdbDetailRaw {
  id: number;
  title?: string;
  name?: string;
  overview?: string | null;
  poster_path?: string | null;
  backdrop_path?: string | null;
  release_date?: string;
  first_air_date?: string;
  vote_average?: number | null;
  runtime?: number | null; // movie
  episode_run_time?: number[]; // tv
  genres?: TmdbGenre[];
  credits?: { cast?: TmdbCastRaw[] };
}

interface Envelope<T> {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string };
}

const CLIENT_TIMEOUT_MS = 10_000;

/**
 * LIMITEUR DE DEBIT (token-bucket a intervalle minimum). Le proxy plafonne a
 * 60 req/min/IP : on serialise l'ESPACEMENT de tous les appels (search ET detail
 * confondus, quelle que soit la concurrence appelante) a >= MIN_INTERVAL_MS.
 * 1150 ms => ~52 req/min, marge sous 60 pour ne jamais declencher de 429 en
 * regime normal. Un 429 residuel repousse en plus le prochain creneau (cooldown).
 */
const MIN_INTERVAL_MS = 1150;
const RATE_RETRIES = 4; // tentatives max sur 429 avant d'abandonner l'appel
let nextSlotAt = 0;

/** Reserve le prochain creneau d'emission ; renvoie le delai d'attente (ms). */
function reserveSlot(): number {
  const now = Date.now();
  const start = Math.max(now, nextSlotAt);
  nextSlotAt = start + MIN_INTERVAL_MS;
  return start - now;
}

/** Repousse la file entiere (cooldown global apres un 429). */
function pushCooldown(ms: number): void {
  nextSlotAt = Math.max(nextSlotAt, Date.now() + ms);
}

function delay(ms: number): Promise<void> {
  return ms <= 0 ? Promise.resolve() : new Promise((resolve) => setTimeout(resolve, ms));
}

/** Attente de repli sur 429 : Retry-After si fourni, sinon backoff exponentiel borne. */
function retryDelayMs(res: Response, attempt: number): number {
  const header = res.headers.get('retry-after');
  if (header !== null) {
    const secs = Number.parseInt(header, 10);
    if (Number.isFinite(secs) && secs > 0) return Math.min(secs * 1000, 30_000);
  }
  return Math.min(1500 * 2 ** attempt, 30_000); // 1.5s, 3s, 6s, 12s...
}

async function call<T>(body: Record<string, unknown>): Promise<T | null> {
  for (let attempt = 0; ; attempt += 1) {
    await delay(reserveSlot());

    let res: Response;
    try {
      res = await fetch('/api/tmdb', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        cache: 'no-store',
        signal: AbortSignal.timeout(CLIENT_TIMEOUT_MS),
      });
    } catch (error) {
      if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
        throw new TmdbError('timeout', 'Le proxy TMDB ne repond pas.');
      }
      throw new TmdbError('unreachable', 'Proxy TMDB injoignable.');
    }

    // 429 : on PATIENTE (cooldown global + backoff) puis on retente le MEME appel.
    if (res.status === 429) {
      if (attempt < RATE_RETRIES) {
        const wait = retryDelayMs(res, attempt);
        pushCooldown(wait);
        await delay(wait);
        continue;
      }
      throw new TmdbError('rate_limited', 'Quota TMDB atteint (429) apres plusieurs tentatives.');
    }

    let payload: Envelope<T> | null = null;
    try {
      payload = (await res.json()) as Envelope<T>;
    } catch {
      // payload null -> erreur ci-dessous
    }
    if (payload !== null && payload.ok) return payload.data ?? null;

    // Rate-limit signale dans le corps (defensif) : meme traitement.
    if (payload?.error?.code === 'rate_limited' && attempt < RATE_RETRIES) {
      const wait = retryDelayMs(res, attempt);
      pushCooldown(wait);
      await delay(wait);
      continue;
    }
    throw new TmdbError(payload?.error?.code ?? 'unknown', payload?.error?.message ?? 'Erreur TMDB.');
  }
}

export function searchMovie(query: string, year?: number): Promise<{ results?: TmdbSearchItem[] } | null> {
  return call<TmdbSearchResponse>({ action: 'search_movie', query, year });
}

export function searchTv(query: string, year?: number): Promise<{ results?: TmdbSearchItem[] } | null> {
  return call<TmdbSearchResponse>({ action: 'search_tv', query, year });
}

export function movieDetail(id: number): Promise<TmdbDetailRaw | null> {
  return call<TmdbDetailRaw>({ action: 'movie_detail', id });
}

export function tvDetail(id: number): Promise<TmdbDetailRaw | null> {
  return call<TmdbDetailRaw>({ action: 'tv_detail', id });
}

export function movieGenres(): Promise<TmdbGenreListResponse | null> {
  return call<TmdbGenreListResponse>({ action: 'genre_movie_list' });
}

export function tvGenres(): Promise<TmdbGenreListResponse | null> {
  return call<TmdbGenreListResponse>({ action: 'genre_tv_list' });
}
