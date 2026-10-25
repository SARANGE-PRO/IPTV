import { NextResponse } from 'next/server';
import { TMDB_API_KEY } from '@/config/env';
import { clientIp, createRateLimiter } from '@/server/rateLimit';

/**
 * Proxy TMDB — la cle reste STRICTEMENT cote serveur (TMDB_API_KEY, jamais
 * NEXT_PUBLIC_). Le client n'appelle jamais TMDB directement. Allowlist
 * d'actions ; langue fr-FR / region FR par defaut.
 *
 * Supporte les deux formats de cle TMDB : jeton v4 (Bearer, contient un point)
 * ou cle v3 (parametre api_key).
 */

export const maxDuration = 20;

const TMDB_BASE = 'https://api.themoviedb.org/3';
const TIMEOUT_MS = 12_000;

/** Reponses non mises en cache CDN/navigateur : le client a sa propre couche
 * de cache (Dexie), et on evite toute retention cote infra. */
const NO_STORE = { 'Cache-Control': 'no-store' } as const;

type Action =
  | 'search_movie'
  | 'search_tv'
  | 'movie_detail'
  | 'tv_detail'
  | 'genre_movie_list'
  | 'genre_tv_list'
  | 'collection_detail'
  | 'search_person'
  | 'person_credits';
const ALLOWED_ACTIONS = new Set<Action>([
  'collection_detail',
  'search_person',
  'person_credits',
  'search_movie',
  'search_tv',
  'movie_detail',
  'tv_detail',
  'genre_movie_list',
  'genre_tv_list',
]);

interface TmdbProxyRequest {
  action: Action;
  query?: string;
  year?: number;
  id?: number;
}

function parse(value: unknown): TmdbProxyRequest | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.action !== 'string' || !ALLOWED_ACTIONS.has(v.action as Action)) return null;
  const action = v.action as Action;

  if (action === 'search_person') {
    if (typeof v.query !== 'string' || v.query.trim() === '') return null;
    return { action, query: v.query.trim().slice(0, 100) };
  }
  if (action === 'search_movie' || action === 'search_tv') {
    if (typeof v.query !== 'string' || v.query.trim() === '') return null;
    const year = typeof v.year === 'number' && Number.isFinite(v.year) ? v.year : undefined;
    return { action, query: v.query.trim().slice(0, 200), year };
  }
  // Listes de genres : aucun parametre requis.
  if (action === 'genre_movie_list' || action === 'genre_tv_list') {
    return { action };
  }
  if (typeof v.id !== 'number' || !Number.isFinite(v.id)) return null;
  return { action, id: Math.trunc(v.id) };
}

function endpointPath(req: TmdbProxyRequest): string {
  switch (req.action) {
    case 'search_movie':
      return `${TMDB_BASE}/search/movie`;
    case 'search_tv':
      return `${TMDB_BASE}/search/tv`;
    case 'movie_detail':
      return `${TMDB_BASE}/movie/${req.id}`;
    case 'tv_detail':
      return `${TMDB_BASE}/tv/${req.id}`;
    case 'genre_movie_list':
      return `${TMDB_BASE}/genre/movie/list`;
    case 'genre_tv_list':
      return `${TMDB_BASE}/genre/tv/list`;
    case 'collection_detail':
      return `${TMDB_BASE}/collection/${req.id}`;
    case 'search_person':
      return `${TMDB_BASE}/search/person`;
    case 'person_credits':
      return `${TMDB_BASE}/person/${req.id}/combined_credits`;
  }
}

function buildUrl(req: TmdbProxyRequest): string {
  const url = new URL(endpointPath(req));
  url.searchParams.set('language', 'fr-FR');
  if (req.action === 'search_movie' || req.action === 'search_tv') {
    url.searchParams.set('query', req.query ?? '');
    url.searchParams.set('include_adult', 'false');
    url.searchParams.set('region', 'FR');
    if (req.year !== undefined) {
      url.searchParams.set(req.action === 'search_movie' ? 'year' : 'first_air_date_year', String(req.year));
    }
  } else if (req.action === 'search_person') {
    url.searchParams.set('query', req.query ?? '');
    url.searchParams.set('include_adult', 'false');
  } else if (req.action === 'movie_detail' || req.action === 'tv_detail') {
    // videos : bande-annonce (FR d'abord, sinon EN) — metadonnees uniquement.
    url.searchParams.set('append_to_response', 'credits,videos');
    url.searchParams.set('include_video_language', 'fr,en,null');
  }
  return url.toString();
}

function fail(status: number, code: string, message: string): NextResponse {
  return NextResponse.json({ ok: false, error: { code, message } }, { status, headers: NO_STORE });
}

// 240/min : le backfill client s'espace a ~214/min (tmdbClient). TMDB lui-meme
// accepte ~50 req/s ; ce plafond (best-effort, par instance) ne protege que
// contre un abus grossier du quota TMDB de l'utilisateur.
const isRateLimited = createRateLimiter({ windowMs: 60_000, max: 240 });

/** Preflight CORS (coquille statique) : en-tetes via next.config.mjs. */
export function OPTIONS(): Response {
  return new Response(null, { status: 204 });
}

export async function POST(request: Request): Promise<NextResponse> {
  if (TMDB_API_KEY === '') {
    return fail(503, 'not_configured', 'TMDB non configuré sur le serveur.');
  }

  if (isRateLimited(clientIp(request))) {
    return fail(429, 'rate_limited', 'Trop de requêtes, réessaie dans un instant.');
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, 'invalid_request', 'Corps JSON invalide.');
  }
  const parsed = parse(body);
  if (parsed === null) return fail(400, 'invalid_request', 'Requête TMDB invalide.');

  const isV4 = TMDB_API_KEY.includes('.');
  let target = buildUrl(parsed);
  const headers: Record<string, string> = { accept: 'application/json' };
  if (isV4) headers.authorization = `Bearer ${TMDB_API_KEY}`;
  else target += `${target.includes('?') ? '&' : '?'}api_key=${encodeURIComponent(TMDB_API_KEY)}`;

  let upstream: Response;
  try {
    upstream = await fetch(target, { headers, cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    const name = err instanceof Error ? err.name : '';
    if (name === 'TimeoutError' || name === 'AbortError') {
      return fail(504, 'timeout', 'TMDB ne répond pas.');
    }
    return fail(502, 'unreachable', 'TMDB injoignable.');
  }

  if (upstream.status === 404) return NextResponse.json({ ok: true, data: null }, { headers: NO_STORE });
  if (!upstream.ok) return fail(502, 'upstream', `Erreur TMDB (HTTP ${upstream.status}).`);

  let data: unknown;
  try {
    data = await upstream.json();
  } catch {
    return fail(502, 'invalid_response', 'Réponse TMDB illisible.');
  }
  return NextResponse.json({ ok: true, data }, { headers: NO_STORE });
}
