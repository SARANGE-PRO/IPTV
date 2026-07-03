import { NextResponse } from 'next/server';

/**
 * Proxy METADONNEES Xtream (player_api.php) — regle le CORS et normalise les
 * erreurs. INTERDIT aux flux video : seules les actions metadonnees
 * ci-dessous sont autorisees et seule l'URL player_api.php est construite
 * (jamais /live, /movie ou /series). Les identifiants transitent dans le
 * corps POST et ne sont JAMAIS logges.
 */

export const maxDuration = 30;

const ALLOWED_ACTIONS = new Set([
  'get_live_categories',
  'get_vod_categories',
  'get_series_categories',
  'get_live_streams',
  'get_vod_streams',
  'get_series',
  'get_series_info',
  'get_vod_info',
  // EPG (programme TV) — metadonnees uniquement, jamais de flux.
  'get_short_epg',
]);

const ALLOWED_PARAMS = new Set(['category_id', 'series_id', 'vod_id', 'stream_id', 'limit']);

const TIMEOUT_MS = 20_000;

/** Defense en profondeur (invariant #2) : aucune reponse metadonnee ne doit
 * etre mise en cache par un CDN, un proxy ou le navigateur. */
const NO_STORE = { 'Cache-Control': 'no-store' } as const;

interface ProxyRequest {
  serverUrl: string;
  username: string;
  password: string;
  action?: string;
  params: Record<string, string>;
}

function parseRequest(value: unknown): ProxyRequest | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.serverUrl !== 'string' || typeof v.username !== 'string' || typeof v.password !== 'string') {
    return null;
  }
  if (v.serverUrl === '' || v.username === '' || v.password === '') return null;

  let action: string | undefined;
  if (v.action !== undefined) {
    if (typeof v.action !== 'string' || !ALLOWED_ACTIONS.has(v.action)) return null;
    action = v.action;
  }

  const params: Record<string, string> = {};
  if (v.params !== undefined) {
    if (typeof v.params !== 'object' || v.params === null) return null;
    for (const [key, val] of Object.entries(v.params)) {
      if (!ALLOWED_PARAMS.has(key)) return null;
      if (typeof val !== 'string' && typeof val !== 'number') return null;
      params[key] = String(val);
    }
  }

  return { serverUrl: v.serverUrl, username: v.username, password: v.password, action, params };
}

/** Construit l'URL player_api.php — seul endpoint Xtream jamais appele ici. */
function buildApiUrl(req: ProxyRequest): URL | null {
  let base: URL;
  try {
    base = new URL(req.serverUrl);
  } catch {
    return null;
  }
  if (base.protocol !== 'http:' && base.protocol !== 'https:') return null;

  const path = base.pathname.replace(/\/+$/, '');
  const url = new URL(`${path}/player_api.php`, base.origin);
  url.searchParams.set('username', req.username);
  url.searchParams.set('password', req.password);
  if (req.action !== undefined) url.searchParams.set('action', req.action);
  for (const [key, val] of Object.entries(req.params)) url.searchParams.set(key, val);
  return url;
}

function fail(status: number, code: string, message: string): NextResponse {
  return NextResponse.json({ ok: false, error: { code, message } }, { status, headers: NO_STORE });
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, 'invalid_request', 'Corps JSON invalide.');
  }

  const parsed = parseRequest(body);
  if (parsed === null) return fail(400, 'invalid_request', 'Requete invalide ou action non autorisee.');

  const url = buildApiUrl(parsed);
  if (url === null) return fail(400, 'invalid_url', 'URL du serveur invalide.');

  let upstream: Response;
  try {
    upstream = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    const name = err instanceof Error ? err.name : '';
    if (name === 'TimeoutError' || name === 'AbortError') {
      return fail(504, 'timeout', 'Le serveur Xtream ne repond pas (timeout).');
    }
    return fail(502, 'unreachable', 'Serveur Xtream injoignable.');
  }

  if (!upstream.ok) return fail(502, 'upstream', `Erreur du serveur Xtream (HTTP ${upstream.status}).`);

  let data: unknown;
  try {
    data = await upstream.json();
  } catch {
    return fail(502, 'invalid_response', 'Reponse Xtream illisible (JSON attendu).');
  }

  return NextResponse.json({ ok: true, data }, { headers: NO_STORE });
}
