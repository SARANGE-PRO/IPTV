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
// Genereux : le tunnel (Tailscale/Cloudflare) peut etre lent au 1er contact
// depuis un reseau mobile. Trop court -> faux "passerelle absente" -> VLC a tort.
const HEALTH_TIMEOUT_MS = 8_000;

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
    // AbortController + setTimeout (et NON AbortSignal.timeout, absent de Safari
    // iOS < 16) : sinon l'appel plante et la passerelle parait toujours absente.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
    try {
      const res = await fetch(`${MEDIA_GATEWAY_URL}/_health`, {
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal,
      });
      ok = res.ok;
    } catch {
      ok = false;
    } finally {
      clearTimeout(timer);
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
