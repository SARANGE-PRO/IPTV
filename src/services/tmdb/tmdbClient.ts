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

async function call<T>(body: Record<string, unknown>): Promise<T | null> {
  let res: Response;
  try {
    res = await fetch('/api/tmdb', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new TmdbError('unreachable', 'Proxy TMDB injoignable.');
  }
  let payload: Envelope<T> | null = null;
  try {
    payload = (await res.json()) as Envelope<T>;
  } catch {
    // payload null -> erreur ci-dessous
  }
  if (payload !== null && payload.ok) return payload.data ?? null;
  throw new TmdbError(payload?.error?.code ?? 'unknown', payload?.error?.message ?? 'Erreur TMDB.');
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
