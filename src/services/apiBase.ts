/**
 * Origine des routes `/api/*` (proxy metadonnees, TMDB, foot, EPG).
 *
 *  - Vercel / Docker : vide -> meme origine (`/api/xtream`).
 *  - Coquille HTTP STATIQUE (GitHub Pages, infra/http-shell) : il n'y a pas de
 *    serveur, les routes restent sur Vercel -> NEXT_PUBLIC_API_BASE_URL =
 *    `https://<app>.vercel.app` (appel cross-origin : CORS ouvert cote Vercel
 *    via CORS_ALLOWED_ORIGIN, voir next.config.mjs). Une page HTTP a le droit
 *    d'appeler une API HTTPS.
 *
 * Jamais de flux video ici : seules les metadonnees passent par ces routes.
 */
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL?.trim().replace(/\/+$/, '') ?? '';

export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}
