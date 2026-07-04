import { NextResponse } from 'next/server';

/**
 * Proxy METADONNEES Xtream (player_api.php) — regle le CORS et normalise les
 * erreurs. INTERDIT aux flux video : seules les actions metadonnees
 * ci-dessous sont autorisees et seule l'URL player_api.php est construite
 * (jamais /live, /movie ou /series). Les identifiants transitent dans le
 * corps POST et ne sont JAMAIS logges.
 */

export const maxDuration = 60;

/** Actions renvoyant tout un catalogue (plusieurs Mo) : timeout amont allonge. */
const LIST_ACTIONS = new Set(['get_live_streams', 'get_vod_streams', 'get_series']);

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
  // EPG COMPLET d'une chaine (plusieurs jours) — pour la detection sport 7j.
  'get_simple_data_table',
]);

const ALLOWED_PARAMS = new Set(['category_id', 'series_id', 'vod_id', 'stream_id', 'limit']);

const TIMEOUT_MS = 20_000;
const LIST_TIMEOUT_MS = 50_000;

/**
 * Anti-SSRF (invariant #2 en defense) : le proxy ne doit relayer QUE des
 * serveurs Xtream publics, jamais le reseau interne (metadonnees cloud
 * 169.254.169.254, routeur 192.168.x, loopback...). On rejette tout hote qui
 * est une IP litterale privee/reservee ou un nom d'hote interne. La resolution
 * DNS-rebinding reste un residuel accepte (app perso), mais l'attaque directe
 * par IP interne est bloquee, et `redirect:'error'` empeche le contournement
 * par redirection amont.
 */
function ipv4ToLong(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let long = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    long = long * 256 + n;
  }
  return long >>> 0;
}

function isPrivateIpv4(ip: string): boolean {
  const long = ipv4ToLong(ip);
  if (long === null) return false;
  const inRange = (base: string, bits: number): boolean => {
    const baseLong = ipv4ToLong(base);
    if (baseLong === null) return false;
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (long & mask) === (baseLong & mask);
  };
  return (
    inRange('0.0.0.0', 8) || // "this host"
    inRange('10.0.0.0', 8) ||
    inRange('100.64.0.0', 10) || // CGNAT
    inRange('127.0.0.0', 8) || // loopback
    inRange('169.254.0.0', 16) || // link-local (metadonnees cloud)
    inRange('172.16.0.0', 12) ||
    inRange('192.168.0.0', 16)
  );
}

function isBlockedIpv6(host: string): boolean {
  const h = host.toLowerCase();
  if (h === '::1' || h === '::') return true; // loopback / unspecified
  const mappedIp = h.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/)?.[1]; // IPv4-mapped
  if (mappedIp !== undefined) return isPrivateIpv4(mappedIp);
  const firstHextet = h.split(':')[0] ?? '';
  if (/^f[cd][0-9a-f]{0,2}$/.test(firstHextet)) return true; // fc00::/7 (ULA)
  if (/^fe[89ab][0-9a-f]?$/.test(firstHextet)) return true; // fe80::/10 (link-local)
  return false;
}

function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, '');
  if (h === '') return true;
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  if (h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (h === 'metadata.google.internal') return true;
  if (isPrivateIpv4(h)) return true;
  if (h.includes(':') && isBlockedIpv6(h)) return true;
  return false;
}

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
  if (isBlockedHost(base.hostname)) return null;

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
  if (url === null) return fail(400, 'invalid_url', 'URL du serveur invalide ou hote non autorise.');

  const timeoutMs = parsed.action !== undefined && LIST_ACTIONS.has(parsed.action) ? LIST_TIMEOUT_MS : TIMEOUT_MS;

  let upstream: Response;
  try {
    // redirect:'error' : une redirection amont vers une IP interne ne doit pas
    // contourner le filtre anti-SSRF (le 1er hop est deja valide ci-dessus).
    upstream = await fetch(url, {
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs),
    });
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
