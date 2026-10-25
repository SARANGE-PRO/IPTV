import { NextResponse } from 'next/server';
import { XTREAM_ALLOWED_HOSTS } from '@/config/env';
import { clientIp, createRateLimiter } from '@/server/rateLimit';
import { buildApiUrl, LIST_ACTIONS, parseRequest } from '@/server/xtream/proxyRequest';

/**
 * Proxy METADONNEES Xtream (player_api.php) — regle le CORS et normalise les
 * erreurs. INTERDIT aux flux video : validation (actions, parametres,
 * anti-SSRF) dans `server/xtream/proxyRequest.ts`. Les identifiants transitent
 * dans le corps POST et ne sont JAMAIS logges.
 */

export const maxDuration = 60;

const TIMEOUT_MS = 20_000;
const LIST_TIMEOUT_MS = 50_000;

// 300/min/IP : une synchro complete + l'EPG foot (une chaine par diffusion)
// restent tres en dessous ; ce plafond freine seulement l'usage du proxy comme
// relais ouvert (essais d'identifiants en rafale depuis les IP Vercel).
const isRateLimited = createRateLimiter({ windowMs: 60_000, max: 300 });

/** Defense en profondeur (invariant #2) : aucune reponse metadonnee ne doit
 * etre mise en cache par un CDN, un proxy ou le navigateur. */
const NO_STORE = { 'Cache-Control': 'no-store' } as const;

function fail(status: number, code: string, message: string): NextResponse {
  return NextResponse.json({ ok: false, error: { code, message } }, { status, headers: NO_STORE });
}

/** Preflight CORS (coquille statique cross-origin) : les en-tetes
 *  Access-Control-* viennent de next.config.mjs (CORS_ALLOWED_ORIGIN). */
export function OPTIONS(): Response {
  return new Response(null, { status: 204 });
}

export async function POST(request: Request): Promise<NextResponse> {
  if (isRateLimited(clientIp(request))) {
    return fail(429, 'rate_limited', 'Trop de requetes, reessaie dans un instant.');
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, 'invalid_request', 'Corps JSON invalide.');
  }

  const parsed = parseRequest(body);
  if (parsed === null) return fail(400, 'invalid_request', 'Requete invalide ou action non autorisee.');

  const url = buildApiUrl(parsed, XTREAM_ALLOWED_HOSTS);
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
