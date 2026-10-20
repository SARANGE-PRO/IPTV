/**
 * Liens internes de l'app — AUCUNE route dynamique (`/movies/[id]`…) : l'app
 * doit pouvoir etre exportee en statique (coquille HTTP, infra/http-shell).
 *
 *  - Film / serie : parametre de requete RELATIF (`?vod=`, `?series=`). Le
 *    detail s'ouvre en MODAL par-dessus la page courante (liste, recherche,
 *    favoris, accueil…) via `DetailModalHost` dans le layout (app) : la page
 *    reste montee, scroll et filtres preserves — comme les anciennes
 *    intercepting routes, sans dependre du routeur. `base` force une page
 *    (ex. depuis la palette de commandes, hors de tout contexte de liste).
 *  - Live : page plein ecran `/live/watch?id=`.
 */
export function liveHref(streamId: string): string {
  return `/live/watch?id=${encodeURIComponent(streamId)}`;
}

export function movieHref(vodId: string, base = ''): string {
  return `${base}?vod=${encodeURIComponent(vodId)}`;
}

export function seriesHref(seriesId: string, base = ''): string {
  return `${base}?series=${encodeURIComponent(seriesId)}`;
}
