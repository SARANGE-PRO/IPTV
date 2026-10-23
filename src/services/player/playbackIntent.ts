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

export function wasPausedByUser(video: HTMLVideoElement): boolean {
  const at = userPauses.get(video);
  return at !== undefined && Date.now() - at < USER_PAUSE_WINDOW_MS;
}
