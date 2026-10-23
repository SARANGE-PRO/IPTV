'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { IconPlayFilled } from '@/components/player/playerIcons';
import { bindSlotGestures } from '@/components/player/host/playerGesture';
import { registerSlot, type SlotHandle, type SlotLayout } from '@/components/player/host/playerSurface';
import { cn } from '@/lib/cn';
import { playerSessionKey, usePlayerStore } from '@/stores/playerStore';
import type { NowPlayingMedia, PlayerHandlers, PlayerSource } from '@/types/nowPlaying';
import { secureImageSrc } from '@/utils/secureUrl';

interface PlayerSlotProps extends PlayerSource, PlayerHandlers {
  media: NowPlayingMedia;
  /** 'live' : plein ecran automatique telephone a l'horizontale. */
  layout?: SlotLayout;
  className?: string;
  /** Glisser la video vers le bas (mobile) : meme action que le bouton retour
   *  de la page -> la lecture continue en mini-lecteur. */
  onMinimize?: () => void;
  /** Swipe horizontal sur la video (Live) : gauche = suivant, droite = precedent. */
  onSwipeNext?: (() => void) | null;
  onSwipePrevious?: (() => void) | null;
  /** Surimpressions qui suivent la video (titre de chaine…). */
  children?: ReactNode;
}

/**
 * Emplacement du lecteur dans une page. Remplace <VideoPlayer> : memes props,
 * plus `media` (affichage mini-lecteur / ecran verrouille). Au montage, lance
 * la lecture et accueille le lecteur unique ; au demontage (retour, fermeture
 * de fiche, autre onglet), la lecture continue dans le mini-lecteur.
 *
 * Si une AUTRE lecture a pris la main entre-temps, l'emplacement affiche une
 * vignette « Lire ici » au lieu d'une zone noire.
 *
 * Reprise sans rechargement : un emplacement qui s'ouvre sur le titre DEJA en
 * cours (meme element, meme URL) adopte la lecture telle qu'elle est, meme si
 * la page recalcule un autre chemin de lecture (repli passerelle oublie, autre
 * position de reprise). Un changement de flux PENDANT que la page est ouverte
 * (zapping, episode, repli) relance normalement.
 */
export function PlayerSlot({
  media,
  layout = 'default',
  className,
  onMinimize,
  onSwipeNext = null,
  onSwipePrevious = null,
  children,
  onProgress,
  onEnded,
  onError,
  onDirectMkvFailed,
  errorActions,
  next,
  ...source
}: PlayerSlotProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const targetRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<SlotHandle | null>(null);
  const key = playerSessionKey(media, source);
  const [mountKey] = useState(key);
  const [adoptKey, setAdoptKey] = useState<string | null>(() => {
    const current = usePlayerStore.getState().session;
    if (current === null) return null;
    const same =
      current.media.kind === media.kind &&
      current.media.ownerId === media.ownerId &&
      current.media.itemId === media.itemId &&
      current.source.src === source.src;
    return same ? current.key : null;
  });
  // Cle de la lecture que cet emplacement accueille.
  const sessionKey = adoptKey !== null && key === mountKey ? adoptKey : key;
  const active = usePlayerStore((s) => s.session?.key === sessionKey);

  const handlers: PlayerHandlers = { onProgress, onEnded, onError, onDirectMkvFailed, errorActions, next };
  const latest = useRef({ media, source, handlers });
  latest.current = { media, source, handlers };

  // Rappels et affichage toujours a jour pour la session en cours.
  useLayoutEffect(() => {
    usePlayerStore.getState().refresh(sessionKey, latest.current.media, latest.current.handlers);
  });

  // Enregistrement de l'emplacement (une fois). Sa liberation, synchrone avant
  // le retrait du DOM, bascule la lecture dans le mini-lecteur sans coupure.
  useLayoutEffect(() => {
    const target = targetRef.current;
    if (target === null) return;
    const handle = registerSlot(target, layout);
    handleRef.current = handle;
    return () => {
      handle.release();
      handleRef.current = null;
    };
  }, [layout]);

  const start = () => {
    const { media: m, source: src, handlers: h } = latest.current;
    const store = usePlayerStore.getState();
    if (sessionKey !== key && store.session?.key === sessionKey) {
      // Reprise : la lecture en cours vient simplement s'afficher ici.
      store.refresh(sessionKey, m, h);
      handleRef.current?.claim(sessionKey);
      return;
    }
    if (adoptKey !== null) setAdoptKey(null);
    store.play({ key, media: m, source: src }, h);
    handleRef.current?.claim(key);
  };

  // Lecture au montage et a chaque changement de flux (zapping, episode,
  // repli passerelle). Meme flux deja en cours : simple re-affichage ici.
  useLayoutEffect(() => {
    start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKey]);

  // Gestes (mobile) tant que la video est ici : glisser vers le bas, swipe.
  const minimizeRef = useRef(onMinimize);
  minimizeRef.current = onMinimize;
  const swipeRef = useRef({ onNext: onSwipeNext, onPrevious: onSwipePrevious });
  swipeRef.current = { onNext: onSwipeNext, onPrevious: onSwipePrevious };
  const canMinimize = onMinimize !== undefined;
  const canSwipe = onSwipeNext !== null || onSwipePrevious !== null;
  useEffect(() => {
    const wrapper = wrapperRef.current;
    const target = targetRef.current;
    if (!active || (!canMinimize && !canSwipe) || wrapper === null || target === null) return;
    return bindSlotGestures(
      wrapper,
      target,
      () => minimizeRef.current ?? null,
      () => swipeRef.current,
    );
  }, [active, canMinimize, canSwipe]);

  const poster = secureImageSrc(source.poster ?? media.artwork);

  return (
    <div ref={wrapperRef} data-player-slot className={cn('relative', className)}>
      <div ref={targetRef} className={cn('h-full', !active && 'hidden')} />
      {active && children}
      {!active && (
        <button
          type="button"
          onClick={start}
          className={cn(
            'group relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-2xl bg-black',
            layout === 'live' && 'phone-land:aspect-auto phone-land:h-full phone-land:rounded-none',
          )}
          aria-label={`Lire ${media.title} ici`}
        >
          {poster !== null && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={poster} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover opacity-40" />
          )}
          <span className="relative flex items-center gap-2 rounded-full bg-white/90 px-4 py-2 text-sm font-semibold text-ink-950 transition-transform group-active:scale-95">
            <IconPlayFilled className="h-4 w-4" />
            Lire ici
          </span>
        </button>
      )}
    </div>
  );
}
