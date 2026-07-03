/**
 * Capacites de lecture du navigateur courant (client uniquement).
 *
 * `supportsNativeHls` est vrai sur Safari (iOS/iPadOS/macOS) : ces navigateurs
 * lisent le HLS `.m3u8` nativement MAIS refusent souvent un flux Live servi en
 * MP4 fragmente progressif (sans Range). On s'en sert pour demander le Live en
 * `.m3u8` sur Safari, et en `.ts` (transcode passerelle) ailleurs (Chrome/Edge).
 */
export function supportsNativeHls(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    return document.createElement('video').canPlayType('application/vnd.apple.mpegurl') !== '';
  } catch {
    return false;
  }
}

/** Conteneurs lus nativement par le <video> de Safari (H.264/HEVC + AAC). */
const NATIVE_CONTAINER = /^(mp4|m4v|mov)$/i;
/** Conteneurs qu'aucun navigateur ne decode : transcodage (passerelle) requis. */
const TRANSCODE_CONTAINER = /^(mkv|avi|wmv|flv|mpg|mpeg|vob|divx|m2ts|ogm|ts)$/i;

export type ContainerSupport = 'native' | 'transcode' | 'unknown';

/**
 * Classe un conteneur VOD/serie pour decider du chemin de lecture :
 *  - native   : lisible directement dans l'app (aucune passerelle).
 *  - transcode: illisible en navigateur -> passerelle requise, sinon VLC.
 *  - unknown  : extension absente/atypique -> tentative directe best-effort.
 */
export function classifyContainer(ext: string | null | undefined): ContainerSupport {
  if (ext == null) return 'unknown';
  const e = ext.trim().toLowerCase();
  if (e === '') return 'unknown';
  if (NATIVE_CONTAINER.test(e)) return 'native';
  if (TRANSCODE_CONTAINER.test(e)) return 'transcode';
  return 'unknown';
}
