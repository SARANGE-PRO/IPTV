'use client';

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { IconPauseFilled, IconPlayFilled } from '@/components/player/playerIcons';
import { IconX } from '@/components/ui/icons';
import { cn } from '@/lib/cn';
import type { NowPlayingMedia } from '@/types/nowPlaying';
import './miniPlayer.css';

/** Distance de glissement (px) au-dela de laquelle on ferme. */
const DISMISS_DISTANCE = 96;
/** En-deca : c'est un tap, pas un glissement. */
const TAP_SLOP = 8;

interface MiniPlayerProps {
  mode: 'none' | 'inline' | 'mini';
  media: NowPlayingMedia | null;
  video: HTMLVideoElement | null;
  failed: boolean;
  /** Progression VOD : decalage serveur et duree de repli du flux. */
  startOffset: number;
  fallbackDuration: number | null;
  dockRef: (el: HTMLDivElement | null) => void;
  onExpand: () => void;
  onClose: () => void;
}

function usePaused(video: HTMLVideoElement | null): boolean {
  const [paused, setPaused] = useState(true);
  useEffect(() => {
    if (video === null) return;
    const sync = () => setPaused(video.paused);
    sync();
    video.addEventListener('play', sync);
    video.addEventListener('pause', sync);
    video.addEventListener('playing', sync);
    return () => {
      video.removeEventListener('play', sync);
      video.removeEventListener('pause', sync);
      video.removeEventListener('playing', sync);
    };
  }, [video]);
  return paused;
}

function useRatio(video: HTMLVideoElement | null, enabled: boolean, offset: number, fallback: number | null): number | null {
  const [ratio, setRatio] = useState<number | null>(null);
  useEffect(() => {
    if (video === null || !enabled) {
      setRatio(null);
      return;
    }
    const sync = () => {
      const native = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null;
      const total = native !== null ? offset + native : fallback;
      setRatio(total !== null && total > 0 ? Math.min(1, (offset + video.currentTime) / total) : null);
    };
    sync();
    video.addEventListener('timeupdate', sync);
    video.addEventListener('durationchange', sync);
    return () => {
      video.removeEventListener('timeupdate', sync);
      video.removeEventListener('durationchange', sync);
    };
  }, [video, enabled, offset, fallback]);
  return ratio;
}

/**
 * Mini-lecteur : la lecture continue en bas de l'app quand on quitte l'ecran
 * de lecture. Tap = revenir en grand ; glisser lateralement = fermer.
 * Le <div> `dockRef` accueille la video (deplacee, jamais recreee).
 */
export function MiniPlayer({
  mode,
  media,
  video,
  failed,
  startOffset,
  fallbackDuration,
  dockRef,
  onExpand,
  onClose,
}: MiniPlayerProps) {
  const live = media?.kind === 'live';
  const paused = usePaused(video);
  const ratio = useRatio(video, mode === 'mini' && !live, startOffset, fallbackDuration);

  // Glisser pour fermer (horizontal ; le vertical reste au navigateur).
  const [dragX, setDragX] = useState(0);
  const [leaving, setLeaving] = useState<-1 | 1 | null>(null);
  const drag = useRef<{ x: number; id: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);

  useEffect(() => {
    if (mode !== 'mini') {
      setDragX(0);
      setLeaving(null);
    }
  }, [mode]);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse') return;
    drag.current = { x: e.clientX, id: e.pointerId, moved: false };
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (d === null || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    if (!d.moved && Math.abs(dx) < TAP_SLOP) return;
    d.moved = true;
    setDragX(dx);
  };
  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (d === null || d.id !== e.pointerId) return;
    drag.current = null;
    if (!d.moved) return;
    suppressClick.current = true;
    const dx = e.clientX - d.x;
    if (Math.abs(dx) >= DISMISS_DISTANCE) {
      setLeaving(dx > 0 ? 1 : -1);
      window.setTimeout(onClose, 180);
    } else {
      setDragX(0);
    }
  };
  const guardClick = (action: () => void) => () => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    action();
  };

  const togglePlay = () => {
    if (video === null) return;
    if (video.paused) void video.play().catch(() => {});
    else video.pause();
  };

  const transform =
    leaving !== null ? `translate3d(${leaving * 110}%, 0, 0)` : dragX !== 0 ? `translate3d(${dragX}px, 0, 0)` : undefined;
  const opacity = leaving !== null ? 0 : dragX !== 0 ? Math.max(0.35, 1 - Math.abs(dragX) / 260) : undefined;

  return (
    <div
      className={cn('zib-mini', mode === 'none' && 'hidden', mode === 'inline' && 'invisible')}
      data-mode={mode}
      aria-hidden={mode !== 'mini'}
    >
      <div
        role="region"
        aria-label="Lecture en cours"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        style={{
          transform,
          opacity,
          transition: drag.current !== null ? 'none' : 'transform 220ms ease-out, opacity 220ms ease-out',
          touchAction: 'pan-y',
        }}
        className="relative flex h-16 items-stretch overflow-hidden rounded-2xl border border-white/10 bg-ink-800 shadow-2xl shadow-black/60 md:h-auto md:flex-col"
      >
        {/* Video (deplacee ici par PlayerHost). Tap = revenir en grand. */}
        <button
          type="button"
          onClick={guardClick(onExpand)}
          aria-label={media !== null ? `Agrandir ${media.title}` : 'Agrandir'}
          className="relative aspect-video h-full shrink-0 overflow-hidden bg-black md:h-auto md:w-full"
        >
          <div ref={dockRef} className="pointer-events-none h-full w-full" />
          {live && (
            <span className="pointer-events-none absolute left-1.5 top-1.5 flex items-center gap-1 rounded bg-accent px-1 py-px text-[9px] font-bold uppercase tracking-wider text-white">
              <span className="h-1 w-1 animate-pulse rounded-full bg-white" />
              Direct
            </span>
          )}
        </button>

        <div className="flex min-w-0 flex-1 items-center gap-1 pl-3 pr-1.5 md:py-2">
          <button
            type="button"
            onClick={guardClick(onExpand)}
            className="min-w-0 flex-1 py-1 text-left"
            tabIndex={-1}
          >
            <span className="block truncate text-sm font-medium text-fg">{media?.title ?? ''}</span>
            <span className={cn('block truncate text-xs', failed ? 'text-accent' : 'text-fg-muted')}>
              {failed ? 'Lecture interrompue · toucher pour voir' : (media?.subtitle ?? '')}
            </span>
          </button>
          <button
            type="button"
            onClick={guardClick(togglePlay)}
            disabled={video === null || failed}
            aria-label={paused ? 'Lecture' : 'Pause'}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-fg transition-colors hover:bg-white/10 active:bg-white/15 disabled:opacity-40"
          >
            {paused ? <IconPlayFilled className="h-5 w-5" /> : <IconPauseFilled className="h-5 w-5" />}
          </button>
          <button
            type="button"
            onClick={guardClick(onClose)}
            aria-label="Fermer le lecteur"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-white/10 hover:text-fg active:bg-white/15"
          >
            <IconX className="h-5 w-5" />
          </button>
        </div>

        {ratio !== null && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-white/10">
            <div className="h-full bg-accent" style={{ width: `${ratio * 100}%` }} />
          </div>
        )}
      </div>
    </div>
  );
}
