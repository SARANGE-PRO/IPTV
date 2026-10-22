import { create } from 'zustand';
import type { NowPlayingMedia, PlayerHandlers, PlayerSession, PlayerSource } from '@/types/nowPlaying';

/**
 * Lecture en cours — UN seul lecteur pour toute l'app (PlayerHost). Les pages
 * ne creent plus de <video> : elles reservent un emplacement (PlayerSlot) et
 * demandent la lecture ici. Quitter la page laisse la lecture continuer dans
 * le mini-lecteur.
 */

/**
 * Cle d'identite de lecture. Volontairement SANS startAt/startOffset : rouvrir
 * la fiche d'un titre en cours recalcule une position de reprise, mais c'est
 * le meme flux -> on ne recharge rien.
 */
export function playerSessionKey(media: NowPlayingMedia, source: PlayerSource): string {
  return [
    media.kind,
    media.itemId,
    source.src,
    source.live === true ? 'live' : '',
    source.transcode === true ? 'tc' : '',
    source.preferHls === true ? 'hls' : '',
    source.directMkv === true ? 'mkv' : '',
  ].join('|');
}

function sameMedia(a: NowPlayingMedia, b: NowPlayingMedia): boolean {
  return (
    a.kind === b.kind &&
    a.ownerId === b.ownerId &&
    a.itemId === b.itemId &&
    a.title === b.title &&
    a.subtitle === b.subtitle &&
    a.artwork === b.artwork
  );
}

/**
 * Rappels par cle de session, hors etat reactif (les pages les renouvellent a
 * chaque rendu). On garde aussi la session PRECEDENTE : au changement de flux,
 * l'ancien lecteur enregistre sa derniere position en se demontant -> elle
 * doit partir vers SON titre, pas vers le nouveau.
 */
const handlersByKey = new Map<string, PlayerHandlers>();

function rememberHandlers(key: string, handlers: PlayerHandlers): void {
  handlersByKey.delete(key);
  handlersByKey.set(key, handlers);
  while (handlersByKey.size > 2) {
    const oldest = handlersByKey.keys().next().value;
    if (oldest === undefined) break;
    handlersByKey.delete(oldest);
  }
}

export function getPlayerHandlers(key: string): PlayerHandlers | undefined {
  return handlersByKey.get(key);
}

interface PlayerState {
  session: PlayerSession | null;
  /** Le flux courant a echoue (le mini-lecteur l'affiche, la page propose VLC). */
  failed: boolean;
  /** <video> du lecteur unique (PiP, plein ecran). */
  video: HTMLVideoElement | null;
  /** Lance une lecture. Meme cle que la session en cours : seuls l'affichage et
   *  les rappels sont mis a jour, le flux continue sans coupure. */
  play: (session: PlayerSession, handlers: PlayerHandlers) => void;
  /** Rafraichit rappels + affichage SI `key` est la session en cours. */
  refresh: (key: string, media: NowPlayingMedia, handlers: PlayerHandlers) => void;
  stop: () => void;
  markFailed: () => void;
  setVideo: (video: HTMLVideoElement | null) => void;
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  session: null,
  failed: false,
  video: null,

  play: (session, handlers) => {
    rememberHandlers(session.key, handlers);
    const current = get().session;
    if (current !== null && current.key === session.key) {
      if (!sameMedia(current.media, session.media)) set({ session: { ...current, media: session.media } });
      return;
    }
    set({ session, failed: false });
  },

  refresh: (key, media, handlers) => {
    const current = get().session;
    if (current === null || current.key !== key) return;
    rememberHandlers(key, handlers);
    if (!sameMedia(current.media, media)) set({ session: { ...current, media } });
  },

  stop: () => set({ session: null, failed: false }),
  markFailed: () => set({ failed: true }),
  setVideo: (video) => set({ video }),
}));
