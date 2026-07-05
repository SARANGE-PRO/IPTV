import { NextResponse } from 'next/server';
import { TMDB_API_KEY } from '@/config/env';

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
  | 'genre_tv_list';
const ALLOWED_ACTIONS = new Set<Action>([
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
  } else if (req.action === 'movie_detail' || req.action === 'tv_detail') {
    url.searchParams.set('append_to_response', 'credits');
  }
  return url.toString();
}

function fail(status: number, code: string, message: string): NextResponse {
  return NextResponse.json({ ok: false, error: { code, message } }, { status, headers: NO_STORE });
}

/**
 * Rate-limit BEST-EFFORT par IP (fenetre glissante, en memoire). Limite : l'etat
 * est par INSTANCE serverless (Vercel en spawn plusieurs, remise a zero au cold
 * start) -> ce n'est pas un quota distribue, juste un garde-fou contre l'abus
 * grossier d'un endpoint public (proteger le quota TMDB de l'utilisateur).
 */
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 60; // requetes / minute / IP
const rateHits = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (rateHits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  recent.push(now);
  rateHits.set(ip, recent);
  // Borne la Map (evite une croissance non bornee sur une instance longue-duree).
  if (rateHits.size > 5000) {
    for (const [key, times] of rateHits) {
      if (times.every((t) => now - t >= RATE_WINDOW_MS)) rateHits.delete(key);
    }
  }
  return recent.length > RATE_MAX;
}

function clientIp(request: Request): string {
  const fwd = request.headers.get('x-forwarded-for') ?? '';
  return fwd.split(',')[0]?.trim() || 'unknown';
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
