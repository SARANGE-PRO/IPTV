'use client';

import { useLayoutEffect, useRef } from 'react';
import { IconPlayFilled } from '@/components/player/playerIcons';
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
}

/**
 * Emplacement du lecteur dans une page. Remplace <VideoPlayer> : memes props,
 * plus `media` (affichage mini-lecteur / ecran verrouille). Au montage, lance
 * la lecture et accueille le lecteur unique ; au demontage (retour, fermeture
 * de fiche, autre onglet), la lecture continue dans le mini-lecteur.
 *
 * Si une AUTRE lecture a pris la main entre-temps, l'emplacement affiche une
 * vignette « Lire ici » au lieu d'une zone noire.
 */
export function PlayerSlot({
  media,
  layout = 'default',
  className,
  onProgress,
  onEnded,
  onError,
  onDirectMkvFailed,
  ...source
}: PlayerSlotProps) {
  const targetRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<SlotHandle | null>(null);
  const key = playerSessionKey(media, source);
  const active = usePlayerStore((s) => s.session?.key === key);

  const handlers: PlayerHandlers = { onProgress, onEnded, onError, onDirectMkvFailed };
  const latest = useRef({ media, source, handlers });
  latest.current = { media, source, handlers };

  // Rappels et affichage toujours a jour pour la session en cours.
  useLayoutEffect(() => {
    usePlayerStore.getState().refresh(key, latest.current.media, latest.current.handlers);
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
    usePlayerStore.getState().play({ key, media: m, source: src }, h);
    handleRef.current?.claim(key);
  };

  // Lecture au montage et a chaque changement de flux (zapping, episode,
  // repli passerelle). Meme flux deja en cours : simple re-affichage ici.
  useLayoutEffect(() => {
    start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const poster = secureImageSrc(source.poster ?? media.artwork);

  return (
    <div className={cn('relative', className)}>
      <div ref={targetRef} className={cn('h-full', !active && 'hidden')} />
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
