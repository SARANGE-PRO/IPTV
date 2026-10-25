/**
 * Intention de PAUSE explicite de l'utilisateur via NOS commandes (mini-lecteur).
 * Le lecteur s'en sert pour ne jamais relancer une pause voulue, meme quand le
 * tampon est vide a cet instant (voir `isStarvedPause`).
 */

const userPauses = new WeakMap<HTMLVideoElement, number>();

/** Fenetre pendant laquelle l'evenement `pause` est attribue au geste. */
const USER_PAUSE_WINDOW_MS = 1000;

export function pauseByUser(video: HTMLVideoElement): void {
  userPauses.set(video, Date.now());
  video.pause();
}

/** Dernier geste (doigt, souris, clavier) SUR la <video> : commandes natives comprises. */
const userGestures = new WeakMap<HTMLVideoElement, number>();

/**
 * Suit les gestes sur la <video> : une pause qui suit de pres un geste vient
 * des commandes natives (bouton pause), pas d'un tampon vide -> jamais relancee.
 * Le PiP et l'ecran verrouille passent par la Media Session (pauseByUser).
 */
export function trackUserGestures(video: HTMLVideoElement): () => void {
  const mark = () => userGestures.set(video, Date.now());
  const types = ['pointerdown', 'touchstart', 'keydown'] as const;
  for (const t of types) video.addEventListener(t, mark, { capture: true, passive: true });
  return () => {
    for (const t of types) video.removeEventListener(t, mark, { capture: true });
  };
}

export function wasPausedByUser(video: HTMLVideoElement): boolean {
  const now = Date.now();
  const at = userPauses.get(video);
  const gesture = userGestures.get(video);
  return (
    (at !== undefined && now - at < USER_PAUSE_WINDOW_MS) ||
    (gesture !== undefined && now - gesture < USER_PAUSE_WINDOW_MS)
  );
}
