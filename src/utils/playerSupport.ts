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
