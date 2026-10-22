/**
 * Picture-in-Picture (PiP) — helpers DOM purs, sans etat.
 *
 * Deux API coexistent :
 *  - standard (Chrome, Edge, Safari macOS) : `requestPictureInPicture()`,
 *    `document.pictureInPictureElement`, evenements enter/leavepictureinpicture ;
 *  - WebKit (Safari iOS/iPadOS, qui n'expose PAS `pictureInPictureEnabled`) :
 *    `webkitSetPresentationMode()`, evenement `webkitpresentationmodechanged`.
 *
 * iOS n'accepte l'entree en PiP QUE dans un geste utilisateur (tap) : ces
 * fonctions doivent etre appelees directement depuis un gestionnaire de clic.
 * Le PiP ne survit a la sortie de l'app que pour une lecture native (HLS
 * `.m3u8`, MP4) : c'est le cas du Live sur Safari.
 */

type PresentationMode = 'inline' | 'picture-in-picture' | 'fullscreen';

/** Extensions WebKit absentes des typings standard. */
export interface WebkitVideo extends HTMLVideoElement {
  webkitSupportsPresentationMode?: (mode: PresentationMode) => boolean;
  webkitSetPresentationMode?: (mode: PresentationMode) => void;
  webkitPresentationMode?: PresentationMode;
}

/** Evenements a ecouter sur la <video> pour suivre l'etat PiP. */
export const PIP_EVENTS = [
  'enterpictureinpicture',
  'leavepictureinpicture',
  'webkitpresentationmodechanged',
] as const;

function usesWebkitApi(video: WebkitVideo): boolean {
  return typeof video.webkitSetPresentationMode === 'function' && document.pictureInPictureEnabled !== true;
}

/** L'appareil sait-il mettre CETTE video en PiP ? */
export function isPipSupported(video: HTMLVideoElement): boolean {
  if (typeof document === 'undefined') return false;
  const v = video as WebkitVideo;
  if (document.pictureInPictureEnabled === true && !video.disablePictureInPicture) return true;
  return typeof v.webkitSupportsPresentationMode === 'function' && v.webkitSupportsPresentationMode('picture-in-picture');
}

/** CETTE video est-elle actuellement en PiP ? */
export function isInPip(video: HTMLVideoElement): boolean {
  const v = video as WebkitVideo;
  if (v.webkitPresentationMode === 'picture-in-picture') return true;
  return typeof document !== 'undefined' && document.pictureInPictureElement === video;
}

/** Entre en PiP (a appeler dans un geste utilisateur). Echec silencieux. */
export async function enterPip(video: HTMLVideoElement): Promise<void> {
  const v = video as WebkitVideo;
  try {
    if (usesWebkitApi(v)) {
      v.webkitSetPresentationMode?.('picture-in-picture');
      return;
    }
    if (typeof video.requestPictureInPicture === 'function') await video.requestPictureInPicture();
  } catch {
    // Refus du navigateur (pas de geste, video pas prete) : rien a faire.
  }
}

/** Sort du PiP si CETTE video y est. Echec silencieux. */
export async function exitPip(video: HTMLVideoElement): Promise<void> {
  const v = video as WebkitVideo;
  try {
    if (v.webkitPresentationMode === 'picture-in-picture') {
      v.webkitSetPresentationMode?.('inline');
      return;
    }
    if (typeof document !== 'undefined' && document.pictureInPictureElement === video) {
      await document.exitPictureInPicture();
    }
  } catch {
    // PiP deja ferme : rien a faire.
  }
}
