/**
 * Plein ecran NATIF d'une <video> — helpers DOM purs, sans etat.
 *
 *  - iPhone : seule la video peut passer en plein ecran, via l'API WebKit
 *    `webkitEnterFullscreen()` (lecteur iOS natif). iOS exige un geste
 *    utilisateur pour ENTRER ; la SORTIE est permise sans geste.
 *  - Android / ordinateur / iPad : Fullscreen API standard, geste requis aussi.
 */

export interface FullscreenVideo extends HTMLVideoElement {
  webkitEnterFullscreen?: () => void;
  webkitExitFullscreen?: () => void;
  webkitDisplayingFullscreen?: boolean;
}

/**
 * Telephone tenu a l'horizontale (pas iPad ni fenetre d'ordinateur).
 * DOIT rester identique a l'ecran `phone-land` de tailwind.config.ts.
 */
export const PHONE_LANDSCAPE_QUERY = '(orientation: landscape) and (max-height: 500px) and (pointer: coarse)';

export function isVideoFullscreen(video: HTMLVideoElement): boolean {
  if ((video as FullscreenVideo).webkitDisplayingFullscreen === true) return true;
  return typeof document !== 'undefined' && document.fullscreenElement === video;
}

/** Entre en plein ecran natif (a appeler dans un geste utilisateur). Echec silencieux. */
export function enterVideoFullscreen(video: HTMLVideoElement): void {
  if (isVideoFullscreen(video)) return;
  const v = video as FullscreenVideo;
  try {
    if (typeof video.requestFullscreen === 'function' && document.fullscreenEnabled) {
      void video.requestFullscreen().catch(() => {});
      return;
    }
    v.webkitEnterFullscreen?.();
  } catch {
    // Refus (pas de geste, video pas prete) : le plein ecran CSS reste en place.
  }
}

/** Sort du plein ecran natif si la video y est. Echec silencieux. */
export function exitVideoFullscreen(video: HTMLVideoElement): void {
  const v = video as FullscreenVideo;
  try {
    if (v.webkitDisplayingFullscreen === true) {
      v.webkitExitFullscreen?.();
      return;
    }
    if (typeof document !== 'undefined' && document.fullscreenElement === video) {
      void document.exitFullscreen().catch(() => {});
    }
  } catch {
    // Deja sorti : rien a faire.
  }
}
