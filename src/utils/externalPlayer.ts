/**
 * Ouverture d'un flux dans un lecteur NATIF (VLC) plutot que dans le <video>
 * du navigateur.
 *
 * Pourquoi : pour un provider HTTP-only dont le CDN bloque les IP datacenter,
 * le navigateur ne peut pas lire (mixed-content + 456 via tout proxy cloud, et
 * pas de codec MKV/HEVC). Un lecteur natif sur l'appareil, lui, utilise l'IP
 * RESIDENTIELLE (donc 206) et decode tout. On lui passe l'URL DIRECTE du flux
 * (jamais la passerelle).
 */

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

export function isAndroid(): boolean {
  return typeof navigator !== 'undefined' && /Android/.test(navigator.userAgent);
}

/** URL scheme pour lancer VLC sur le flux (VLC gratuit sur l'App/Play Store). */
export function vlcUrl(streamUrl: string): string {
  if (isIOS()) {
    // API x-callback de VLC iOS.
    return `vlc-x-callback://x-callback-url/stream?url=${encodeURIComponent(streamUrl)}`;
  }
  // Android / autres : VLC gere le scheme vlc://.
  return `vlc://${streamUrl}`;
}

/** Lance le flux dans VLC (bascule d'app). */
export function openInVlc(streamUrl: string): void {
  if (typeof window === 'undefined') return;
  window.location.href = vlcUrl(streamUrl);
}
