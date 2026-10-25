/**
 * Un flux est-il en cours (lecture ou pause, ecran ou mini-lecteur) ? Tenu par
 * `playbackSession` ; lu par les taches de fond qui ne doivent pas disputer le
 * debit a la video (enrichissement TMDB du catalogue).
 */

let active = 0;
let waiters: (() => void)[] = [];

/** Debut d'un flux ; renvoie la fin (idempotente). */
export function markPlaybackActive(): () => void {
  active += 1;
  let ended = false;
  return () => {
    if (ended) return;
    ended = true;
    active = Math.max(0, active - 1);
    if (active === 0) {
      const ready = waiters;
      waiters = [];
      for (const resolve of ready) resolve();
    }
  };
}

export function isPlaybackActive(): boolean {
  return active > 0;
}

/** Se resout a la fin de la lecture (ou a l'abandon via `signal`). */
export function whenPlaybackIdle(signal?: AbortSignal): Promise<void> {
  if (active === 0) return Promise.resolve();
  return new Promise((resolve) => {
    waiters.push(resolve);
    signal?.addEventListener('abort', () => resolve(), { once: true });
  });
}
