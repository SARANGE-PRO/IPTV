/**
 * Passerelle media : configuration + sonde de disponibilite.
 *
 * Sert a decider A LA DEMANDE si un conteneur non-natif (MKV/AVI) peut etre lu
 * DANS l'app (passerelle joignable -> transcodage fMP4 lisible par Safari) ou
 * doit basculer vers VLC. Sans cette sonde, une passerelle configuree mais
 * eteinte (PC coupe) ferait ramer le lecteur au lieu d'echouer proprement.
 *
 * Token unique : /_health est un simple ping HTTP de la passerelle, il ne
 * touche JAMAIS au flux Xtream et ne consomme aucune connexion du compte.
 */

export const MEDIA_GATEWAY_URL =
  process.env.NEXT_PUBLIC_MEDIA_GATEWAY_URL?.trim().replace(/\/+$/, '') ?? '';

export function isGatewayConfigured(): boolean {
  return MEDIA_GATEWAY_URL !== '';
}

const HEALTH_TTL_MS = 30_000;
const HEALTH_TIMEOUT_MS = 4_000;

let cache: { at: number; ok: boolean } | null = null;
let inflight: Promise<boolean> | null = null;

/**
 * Vrai si la passerelle repond a /_health. Resultat mis en cache 30 s et
 * requetes concurrentes dedupliquees (une seule sonde reseau a la fois).
 */
export async function isGatewayHealthy(): Promise<boolean> {
  if (!isGatewayConfigured()) return false;
  const now = Date.now();
  if (cache !== null && now - cache.at < HEALTH_TTL_MS) return cache.ok;
  if (inflight !== null) return inflight;

  inflight = (async () => {
    let ok = false;
    try {
      const res = await fetch(`${MEDIA_GATEWAY_URL}/_health`, {
        method: 'GET',
        cache: 'no-store',
        signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
      });
      ok = res.ok;
    } catch {
      ok = false;
    }
    cache = { at: Date.now(), ok };
    inflight = null;
    return ok;
  })();
  return inflight;
}

/** Invalide le cache (ex. apres un echec de lecture, pour resonder aussitot). */
export function resetGatewayHealthCache(): void {
  cache = null;
}
