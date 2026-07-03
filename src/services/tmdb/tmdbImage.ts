/** Construction des URLs d'images TMDB a partir des fragments de chemin stockes. */

const IMAGE_BASE = 'https://image.tmdb.org/t/p';

export type PosterSize = 'w185' | 'w342' | 'w500';
export type BackdropSize = 'w780' | 'w1280';

export function tmdbPoster(path: string | null, size: PosterSize = 'w342'): string | null {
  return path === null || path === '' ? null : `${IMAGE_BASE}/${size}${path}`;
}

export function tmdbBackdrop(path: string | null, size: BackdropSize = 'w1280'): string | null {
  return path === null || path === '' ? null : `${IMAGE_BASE}/${size}${path}`;
}
