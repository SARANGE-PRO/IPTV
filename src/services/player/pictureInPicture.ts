/**
 * Image dans l'image (PiP) du lecteur unique — Safari iOS (API webkit
 * `webkitSetPresentationMode`) et navigateurs standard (`requestPictureInPicture`).
 *
 * Regle iOS : une app web n'ouvre le PiP QU'EN REPONSE A UN TAP. `enterPip`
 * doit donc etre appele directement dans le gestionnaire du clic, jamais
 * apres un `await` ni a la mise en arriere-plan (c'est pour cela que l'ancien
 * PiP « automatique » ne marchait pas). Seul le plein ecran NATIF passe seul
 * en PiP quand on quitte l'app (reglage iOS « Demarrer PiP automatiquement »).
 */

type WebkitVideo = HTMLVideoElement & {
  webkitSupportsPresentationMode?: (mode: string) => boolean;
  webkitSetPresentationMode?: (mode: 'inline' | 'picture-in-picture' | 'fullscreen') => void;
  webkitPresentationMode?: string;
};

const PIP_EVENTS = ['webkitpresentationmodechanged', 'enterpictureinpicture', 'leavepictureinpicture'] as const;

function webkitPip(video: HTMLVideoElement): boolean {
  const v = video as WebkitVideo;
  return typeof v.webkitSetPresentationMode === 'function' && v.webkitSupportsPresentationMode?.('picture-in-picture') === true;
}

/** Ce navigateur sait mettre CETTE video en PiP. */
export function pipSupported(video: HTMLVideoElement): boolean {
  if (webkitPip(video)) return true;
  return typeof document !== 'undefined' && document.pictureInPictureEnabled === true && typeof video.requestPictureInPicture === 'function';
}

export function isInPip(video: HTMLVideoElement): boolean {
  if ((video as WebkitVideo).webkitPresentationMode === 'picture-in-picture') return true;
  return typeof document !== 'undefined' && document.pictureInPictureElement === video;
}

/** Delai apres lequel un PiP qui ne s'est pas ouvert est considere refuse. */
const PIP_CHECK_MS = 900;

function errorText(err: unknown): string {
  if (err instanceof Error) return err.name !== 'Error' ? `${err.name} : ${err.message}` : err.message;
  return String(err);
}

/**
 * Ouvre le PiP. A appeler DANS le gestionnaire du tap (geste exige par iOS),
 * de facon synchrone : API WebKit (voie native de l'iPhone) si elle existe,
 * sinon API standard (qui, elle, donne un motif de refus). Resout `null` si
 * le PiP s'est ouvert, sinon le motif — iOS refuse souvent sans message.
 */
export function enterPip(video: HTMLVideoElement): Promise<string | null> {
  if (video.readyState < 1) return Promise.resolve('la vidéo n’a pas encore démarré');
  let failure: string | null = null;
  try {
    if (webkitPip(video)) {
      (video as WebkitVideo).webkitSetPresentationMode?.('picture-in-picture');
    } else if (typeof document !== 'undefined' && document.pictureInPictureEnabled === true) {
      video.requestPictureInPicture().catch((err: unknown) => {
        failure = errorText(err);
      });
    } else {
      return Promise.resolve('image dans l’image non disponible ici');
    }
  } catch (err) {
    failure = errorText(err);
  }
  return new Promise((resolve) => {
    setTimeout(() => resolve(isInPip(video) ? null : (failure ?? 'iOS n’a pas ouvert la fenêtre')), PIP_CHECK_MS);
  });
}

/** Ferme le PiP de cette video (sans effet s'il n'est pas ouvert). */
export function exitPip(video: HTMLVideoElement): void {
  const v = video as WebkitVideo;
  if (v.webkitPresentationMode === 'picture-in-picture' && typeof v.webkitSetPresentationMode === 'function') {
    try {
      v.webkitSetPresentationMode('inline');
    } catch {
      // rien a fermer
    }
    return;
  }
  if (typeof document !== 'undefined' && document.pictureInPictureElement === video) {
    void document.exitPictureInPicture().catch(() => undefined);
  }
}

/** Ouvre ou ferme ; resout le motif d'echec d'une ouverture (null = OK). */
export function togglePip(video: HTMLVideoElement): Promise<string | null> {
  if (isInPip(video)) {
    exitPip(video);
    return Promise.resolve(null);
  }
  return enterPip(video);
}

/** Suit l'entree / la sortie de PiP de la video ; retourne le nettoyage. */
export function onPipChange(video: HTMLVideoElement, listener: (inPip: boolean) => void): () => void {
  const handle = () => listener(isInPip(video));
  for (const name of PIP_EVENTS) video.addEventListener(name, handle);
  return () => {
    for (const name of PIP_EVENTS) video.removeEventListener(name, handle);
  };
}
