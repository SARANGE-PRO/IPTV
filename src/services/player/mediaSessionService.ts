import { pauseByUser } from '@/services/player/playbackIntent';
import { secureImageSrc } from '@/utils/secureUrl';
import { isPrivateProfile } from '@/db/profile';

/**
 * Media Session (ecran verrouille iOS, Centre de controle, touches media du
 * Mac) — COMPLETE le lecteur natif sans rien poser sur la video (voir la
 * preference « lecteur natif Apple »). Aucune donnee sensible : titre, sous-
 * titre et affiche uniquement, jamais l'URL du flux.
 */

export interface NowPlayingMeta {
  title: string;
  subtitle: string | null;
  artwork: string | null;
}

export interface NowPlayingActions {
  /** Present -> bouton « suivant » (iOS remplace alors le saut +15 s). */
  onNext?: (() => void) | null;
  onPrevious?: (() => void) | null;
}

function supported(): boolean {
  return typeof navigator !== 'undefined' && 'mediaSession' in navigator && typeof MediaMetadata !== 'undefined';
}

function artworkList(url: string | null): MediaImage[] {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const secure = secureImageSrc(url);
  const list: MediaImage[] = [];
  if (secure !== null) list.push({ src: secure, sizes: '512x512' });
  list.push({ src: `${origin}/icons/icon-512.png`, sizes: '512x512', type: 'image/png' });
  return list;
}

function setHandler(action: MediaSessionAction, handler: (() => void) | null | undefined): void {
  try {
    navigator.mediaSession.setActionHandler(action, handler != null ? () => handler() : null);
  } catch {
    // Action non supportee par ce navigateur : ignoree.
  }
}

export function applyNowPlaying(meta: NowPlayingMeta, actions: NowPlayingActions): void {
  if (!supported()) return;
  try {
    // Mode prive : l'ecran verrouille et le Centre de controle ne montrent
    // jamais ce qui joue.
    navigator.mediaSession.metadata = isPrivateProfile()
      ? new MediaMetadata({ title: 'ZiBTV', artist: '', album: 'ZiBTV', artwork: artworkList(null) })
      : new MediaMetadata({
          title: meta.title,
          artist: meta.subtitle ?? 'ZiBTV',
          album: 'ZiBTV',
          artwork: artworkList(meta.artwork),
        });
  } catch {
    return;
  }
  setHandler('nexttrack', actions.onNext);
  setHandler('previoustrack', actions.onPrevious);
}

/**
 * Lecture / pause depuis l'ecran verrouille, le Centre de controle ou les
 * AirPods : la pause est marquee VOULUE (le lecteur ne la relance jamais comme
 * une pause subie sur tampon vide). Retourne le nettoyage.
 */
export function bindPlayPause(video: HTMLVideoElement): () => void {
  if (!supported()) return () => undefined;
  setHandler('pause', () => pauseByUser(video));
  setHandler('play', () => void video.play().catch(() => undefined));
  return () => {
    setHandler('pause', null);
    setHandler('play', null);
  };
}

export function clearNowPlaying(): void {
  if (!supported()) return;
  setHandler('nexttrack', null);
  setHandler('previoustrack', null);
  try {
    navigator.mediaSession.metadata = null;
  } catch {
    // rien
  }
}
