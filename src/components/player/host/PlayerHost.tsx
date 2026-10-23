'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { MiniPlayer } from '@/components/player/host/MiniPlayer';
import { bindLiftLayer } from '@/components/player/host/playerGesture';
import {
  getSurface,
  getSurfaceSnapshot,
  setActiveSurfaceKey,
  setDockTarget,
  subscribeSurface,
} from '@/components/player/host/playerSurface';
import { VideoPlayer } from '@/components/player/VideoPlayer';
import { useMiniPlayerMediaSession } from '@/hooks/useMiniPlayerMediaSession';
import { getPlayerHandlers, usePlayerStore } from '@/stores/playerStore';
import type { PlaybackFailure } from '@/types/playbackDiagnostics';
import { nowPlayingHref } from '@/utils/appRoutes';

/** Mise en page de la video selon l'endroit ou elle se trouve. */
const LAYOUT = {
  mini: {
    rootClassName: 'h-full w-full',
    className: 'h-full w-full rounded-none',
    videoClassName: 'h-full w-full aspect-auto object-cover',
  },
  live: {
    rootClassName: 'phone-land:h-full',
    className: 'phone-land:h-full phone-land:rounded-none',
    videoClassName: 'phone-land:aspect-auto phone-land:h-full',
  },
  default: { rootClassName: undefined, className: undefined, videoClassName: undefined },
} as const;

/**
 * Lecteur UNIQUE de l'app (monte une fois dans le layout (app)). La <video>
 * vit dans une surface deplacee entre l'emplacement de la page (PlayerSlot) et
 * le mini-lecteur : quitter l'ecran de lecture ne coupe ni l'image ni le son.
 */
export function PlayerHost() {
  const session = usePlayerStore((s) => s.session);
  const failed = usePlayerStore((s) => s.failed);
  const video = usePlayerStore((s) => s.video);
  const setVideo = usePlayerStore((s) => s.setVideo);
  const stop = usePlayerStore((s) => s.stop);
  const surfaceState = useSyncExternalStore(subscribeSurface, getSurfaceSnapshot, getSurfaceSnapshot);
  const router = useRouter();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const liftRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => setMounted(true), []);

  // Calque flottant du geste « glisser pour reduire » (voir playerGesture).
  useEffect(() => {
    const el = liftRef.current;
    if (el === null) return;
    return bindLiftLayer(el);
  }, []);

  const sessionKey = session?.key ?? null;
  useLayoutEffect(() => {
    setActiveSurfaceKey(sessionKey);
  }, [sessionKey]);

  const mode = session === null ? 'none' : surfaceState.mode;
  const mini = mode === 'mini';
  useMiniPlayerMediaSession(session?.media ?? null, mini);

  // Rappels LIES a la session : le lecteur qui se demonte (changement de flux)
  // enregistre sa derniere position pour SON titre, jamais pour le suivant.
  const callbacks = useMemo(() => {
    if (sessionKey === null) return null;
    const key = sessionKey;
    return {
      onProgress: (pos: number, dur: number | null, force: boolean) =>
        getPlayerHandlers(key)?.onProgress?.(pos, dur, force),
      onEnded: () => {
        getPlayerHandlers(key)?.onEnded?.();
        // Film/episode termine en mini-lecteur : rien a regarder, on le ferme.
        if (getSurfaceSnapshot().mode === 'mini' && usePlayerStore.getState().session?.key === key) {
          usePlayerStore.getState().stop();
        }
      },
      onError: (failure: PlaybackFailure) => {
        if (usePlayerStore.getState().session?.key === key) usePlayerStore.getState().markFailed();
        getPlayerHandlers(key)?.onError?.(failure);
      },
      onPlaying: () => {
        if (usePlayerStore.getState().session?.key === key) usePlayerStore.getState().clearFailed();
      },
      onDirectMkvFailed: () => getPlayerHandlers(key)?.onDirectMkvFailed?.(),
    };
  }, [sessionKey]);

  const expand = useCallback(() => {
    const media = usePlayerStore.getState().session?.media;
    if (media === undefined) return;
    router.push(nowPlayingHref(media, pathname, window.location.search));
  }, [router, pathname]);

  const layout = mini ? LAYOUT.mini : surfaceState.layout === 'live' ? LAYOUT.live : LAYOUT.default;

  return (
    <>
      {mounted &&
        session !== null &&
        callbacks !== null &&
        createPortal(
          // PAS de `key` par session : la MEME <video> enchaine les flux
          // (zapping, episode suivant). iOS n'autorise le son qu'apres un geste
          // sur l'element ; un nouvel element par chaine pourrait exiger un tap.
          <VideoPlayer
            {...session.source}
            {...layout}
            compact={mini}
            onVideoElement={setVideo}
            onProgress={callbacks.onProgress}
            onEnded={callbacks.onEnded}
            onError={callbacks.onError}
            onPlaying={callbacks.onPlaying}
            onDirectMkvFailed={callbacks.onDirectMkvFailed}
          />,
          getSurface(),
        )}
      <div ref={liftRef} className="zib-lift" aria-hidden="true" />
      <MiniPlayer
        mode={mode}
        media={session?.media ?? null}
        video={video}
        failed={failed}
        startOffset={session?.source.startOffset ?? 0}
        fallbackDuration={session?.source.duration ?? null}
        dockRef={setDockTarget}
        onExpand={expand}
        onClose={stop}
      />
    </>
  );
}
