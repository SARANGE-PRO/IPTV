/**
 * Version deployee plus recente que l'app ouverte : chaque deploiement
 * REMPLACE le site (coquille HTTP, sans service worker), les anciens fichiers
 * JS disparaissent. Un module charge a la demande (hls.js, moteur MKV) renvoie
 * alors 404 — ce n'est pas le flux qui est en cause : on recharge l'app.
 */

const RELOAD_KEY = 'zibtv:stale-build-reload';
/** Pas plus d'un rechargement par minute (jamais de boucle si le 404 persiste). */
const RELOAD_GUARD_MS = 60_000;

/** Echec de chargement d'un fichier du build (webpack ChunkLoadError & co). */
export function isChunkLoadError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const { name, message } = err as { name?: unknown; message?: unknown };
  return (
    name === 'ChunkLoadError' ||
    (typeof message === 'string' &&
      /Loading (CSS )?chunk [\w-]+ failed|Failed to fetch dynamically imported module|Importing a module script failed/i.test(
        message,
      ))
  );
}

/** Recharge l'app sur la nouvelle version ; faux si un rechargement vient d'avoir lieu. */
export function reloadForNewBuild(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const last = Number(window.sessionStorage.getItem(RELOAD_KEY) ?? '0');
    if (Date.now() - last < RELOAD_GUARD_MS) return false;
    window.sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    // stockage indisponible : on recharge quand meme (une fois par essai utilisateur)
  }
  window.location.reload();
  return true;
}
