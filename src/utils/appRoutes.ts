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
export const HOME_HREF = '/';
export const LIVE_HREF = '/live';
export const SEARCH_HREF = '/search';
export const SETTINGS_HREF = '/settings';
export const FOOTBALL_HREF = '/football';
export const FAVORITES_HREF = '/favorites';

export function liveHref(streamId: string): string {
  return `/live/watch?id=${encodeURIComponent(streamId)}`;
}

export interface PlayOptions {
  /** Ouvre la fiche ET lance la lecture (reprise si progression). */
  play?: boolean;
  /** Series : episode precis a lancer (sinon reprise / 1er episode). */
  episodeId?: string;
}

function playSuffix(opts: PlayOptions | undefined): string {
  if (opts?.play !== true) return '';
  const ep = opts.episodeId !== undefined ? `&ep=${encodeURIComponent(opts.episodeId)}` : '';
  return `&play=1${ep}`;
}

export function movieHref(vodId: string, base = '', opts?: PlayOptions): string {
  return `${base}?vod=${encodeURIComponent(vodId)}${playSuffix(opts)}`;
}

export function seriesHref(seriesId: string, base = '', opts?: PlayOptions): string {
  return `${base}?series=${encodeURIComponent(seriesId)}${playSuffix(opts)}`;
}

/**
 * Revenir en grand sur ce qui joue dans le mini-lecteur, depuis la page
 * COURANTE (`pathname` + `search`) : Live -> page de la chaine ; film/serie ->
 * la fiche s'ouvre en modal par-dessus la page actuelle, en lecture.
 */
export function nowPlayingHref(
  media: { kind: 'live' | 'vod' | 'episode'; ownerId: string; itemId: string },
  pathname: string,
  search: string,
): string {
  if (media.kind === 'live') return liveHref(media.ownerId);
  const params = new URLSearchParams(search);
  for (const name of ['vod', 'series', 'play', 'ep']) params.delete(name);
  if (media.kind === 'vod') {
    params.set('vod', media.ownerId);
  } else {
    params.set('series', media.ownerId);
    params.set('ep', media.itemId);
  }
  params.set('play', '1');
  return `${pathname}?${params.toString()}`;
}
