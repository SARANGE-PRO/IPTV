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
  setSurfaceFrozen,
  subscribeSurface,
} from '@/components/player/host/playerSurface';
import { isInPip, onPipChange } from '@/services/player/pictureInPicture';
import { VideoPlayer } from '@/components/player/VideoPlayer';
import { useMiniPlayerMediaSession } from '@/hooks/useMiniPlayerMediaSession';
import { bindPlayPause } from '@/services/player/mediaSessionService';
import { recordStreamFailure, recordStreamSuccess } from '@/services/live/streamReliabilityService';
import { getPlayerHandlers, usePlayerStore } from '@/stores/playerStore';
import type { PlayerSource } from '@/types/nowPlaying';
import type { PlaybackFailure } from '@/types/playbackDiagnostics';
import { nowPlayingHref } from '@/utils/appRoutes';

/** Aucune session : lecteur au repos, sans source. */
const IDLE_SOURCE: PlayerSource = { src: '' };

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

  // Lecture / pause de l'ecran verrouille et des AirPods (pause = voulue).
  useEffect(() => {
    if (video === null) return;
    return bindPlayPause(video);
  }, [video]);

  // Image dans l'image : tant qu'elle est ouverte, la video ne change plus de
  // place dans la page (un deplacement fermerait le PiP).
  useEffect(() => {
    if (video === null) return;
    setSurfaceFrozen(isInPip(video));
    const unsubscribe = onPipChange(video, setSurfaceFrozen);
    return () => {
      unsubscribe();
      setSurfaceFrozen(false);
    };
  }, [video]);

  const sessionKey = session?.key ?? null;
  useLayoutEffect(() => {
    setActiveSurfaceKey(sessionKey);
  }, [sessionKey]);

  const mode = session === null ? 'none' : surfaceState.mode;
  const mini = mode === 'mini';
  // Episode suivant confie par la fiche serie (marche fiche fermee).
  const next = session !== null ? (getPlayerHandlers(session.key)?.next ?? null) : null;
  useMiniPlayerMediaSession(session?.media ?? null, mini, next);

  // Rappels LIES a la session : le lecteur qui se demonte (changement de flux)
  // enregistre sa derniere position pour SON titre, jamais pour le suivant.
  const callbacks = useMemo(() => {
    if (sessionKey === null) return null;
    const key = sessionKey;
    // Fiabilite apprise (Live) : un succes par session, l'echec definitif.
    let recorded = false;
    const liveItem = () => {
      const s = usePlayerStore.getState().session;
      return s?.key === key && s.media.kind === 'live' ? s.media.itemId : null;
    };
    return {
      onProgress: (pos: number, dur: number | null, force: boolean) =>
        getPlayerHandlers(key)?.onProgress?.(pos, dur, force),
      onEnded: () => {
        getPlayerHandlers(key)?.onEnded?.();
        // Termine en mini-lecteur : episode suivant s'il y en a un, sinon on ferme.
        if (getSurfaceSnapshot().mode === 'mini' && usePlayerStore.getState().session?.key === key) {
          const following = getPlayerHandlers(key)?.next ?? null;
          if (following === null) {
            usePlayerStore.getState().stop();
            return;
          }
          void following.start().then((started) => {
            if (!started && usePlayerStore.getState().session?.key === key) usePlayerStore.getState().stop();
          });
        }
      },
      onError: (failure: PlaybackFailure) => {
        const item = liveItem();
        if (item !== null) recordStreamFailure(item);
        if (usePlayerStore.getState().session?.key === key) usePlayerStore.getState().markFailed();
        getPlayerHandlers(key)?.onError?.(failure);
      },
      onPlaying: () => {
        const item = liveItem();
        if (item !== null && !recorded) {
          recorded = true;
          recordStreamSuccess(item);
        }
        if (usePlayerStore.getState().session?.key === key) usePlayerStore.getState().clearFailed();
      },
      onDirectMkvFailed: () => getPlayerHandlers(key)?.onDirectMkvFailed?.(),
      getErrorActions: () => getPlayerHandlers(key)?.errorActions ?? [],
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
        createPortal(
          // PAS de `key` par session, et monte MEME sans session (src '') : la
          // MEME <video> enchaine les flux (zapping, episode suivant, nouvelle
          // lecture apres fermeture du mini-lecteur). iOS n'autorise le son
          // qu'apres un geste sur l'element ; un nouvel element pourrait exiger
          // un tap.
          <VideoPlayer
            {...(session?.source ?? IDLE_SOURCE)}
            {...layout}
            compact={mini}
            onVideoElement={setVideo}
            onProgress={callbacks?.onProgress}
            onEnded={callbacks?.onEnded}
            onError={callbacks?.onError}
            onPlaying={callbacks?.onPlaying}
            onDirectMkvFailed={callbacks?.onDirectMkvFailed}
            getErrorActions={callbacks?.getErrorActions}
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
