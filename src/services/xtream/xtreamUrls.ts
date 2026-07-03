import type { XtreamCredentials } from '@/types/xtream';

/**
 * Construction des URLs de FLUX video — elles pointent DIRECTEMENT vers le
 * serveur Xtream. Jamais via le proxy Vercel (cout, latence, limites de
 * bande passante), jamais mises en cache par le service worker.
 */

/**
 * Normalise l'URL serveur saisie : ajoute http:// si aucun schema, retire le
 * slash final. Renvoie null si invalide.
 */
export function normalizeServerUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
  } catch {
    return null;
  }
}

const seg = encodeURIComponent;

function base(creds: XtreamCredentials): string {
  return creds.serverUrl.replace(/\/+$/, '');
}

/** Live : .m3u8 par defaut — HLS natif Safari iOS (le MPEG-TS brut n'y est pas lisible). */
export function buildLiveStreamUrl(
  creds: XtreamCredentials,
  streamId: string,
  extension: 'm3u8' | 'ts' = 'm3u8',
): string {
  return `${base(creds)}/live/${seg(creds.username)}/${seg(creds.password)}/${seg(streamId)}.${extension}`;
}

export function buildVodStreamUrl(
  creds: XtreamCredentials,
  streamId: string,
  containerExtension: string | null,
): string {
  return `${base(creds)}/movie/${seg(creds.username)}/${seg(creds.password)}/${seg(streamId)}.${containerExtension ?? 'mp4'}`;
}

export function buildSeriesEpisodeUrl(
  creds: XtreamCredentials,
  episodeId: string,
  containerExtension: string | null,
): string {
  return `${base(creds)}/series/${seg(creds.username)}/${seg(creds.password)}/${seg(episodeId)}.${containerExtension ?? 'mp4'}`;
}
