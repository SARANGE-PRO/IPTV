'use client';

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { IconPauseFilled, IconPlayFilled } from '@/components/player/playerIcons';
import { IconX } from '@/components/ui/icons';
import { cn } from '@/lib/cn';
import type { NowPlayingMedia } from '@/types/nowPlaying';
import './miniPlayer.css';

/** Glissement lateral (px) au-dela duquel on ferme. */
const DISMISS_DISTANCE = 96;
/** Glissement vers le haut (px) : revenir en grand. */
const EXPAND_DISTANCE = 40;
/** Glissement vers le bas (px) : fermer. */
const CLOSE_DISTANCE = 56;
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
 * de lecture. Tap ou glisser vers le haut = revenir en grand ; glisser vers
 * le bas ou sur le cote = fermer.
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

  // Gestes facon YouTube : haut = revenir en grand, bas = fermer,
  // lateral = fermer. Un deplacement sous TAP_SLOP reste un tap.
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [leaving, setLeaving] = useState<'left' | 'right' | 'down' | null>(null);
  const drag = useRef<{ x0: number; y0: number; id: number; axis: 'x' | 'y' | null } | null>(null);
  const suppressClick = useRef(false);

  useEffect(() => {
    if (mode !== 'mini') {
      setOffset({ x: 0, y: 0 });
      setLeaving(null);
    }
  }, [mode]);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse') return;
    // iOS n'emet pas de click apres un glissement : on repart d'un etat propre.
    suppressClick.current = false;
    drag.current = { x0: e.clientX, y0: e.clientY, id: e.pointerId, axis: null };
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (d === null || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x0;
    const dy = e.clientY - d.y0;
    if (d.axis === null) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < TAP_SLOP) return;
      d.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    }
    // Vers le haut : resistance (la carte "tire" vers l'ecran de lecture).
    setOffset(d.axis === 'x' ? { x: dx, y: 0 } : { x: 0, y: dy < 0 ? dy * 0.5 : dy });
  };
  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (d === null || d.id !== e.pointerId) return;
    drag.current = null;
    if (d.axis === null) return;
    suppressClick.current = true;
    const dx = e.clientX - d.x0;
    const dy = e.clientY - d.y0;
    if (d.axis === 'x' && Math.abs(dx) >= DISMISS_DISTANCE) {
      setLeaving(dx > 0 ? 'right' : 'left');
      window.setTimeout(onClose, 180);
    } else if (d.axis === 'y' && dy <= -EXPAND_DISTANCE) {
      setOffset({ x: 0, y: 0 });
      onExpand();
    } else if (d.axis === 'y' && dy >= CLOSE_DISTANCE) {
      setLeaving('down');
      window.setTimeout(onClose, 180);
    } else {
      setOffset({ x: 0, y: 0 });
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

  const dragging = offset.x !== 0 || offset.y !== 0;
  const transform =
    leaving === 'left' || leaving === 'right'
      ? `translate3d(${leaving === 'right' ? 110 : -110}%, 0, 0)`
      : leaving === 'down'
        ? 'translate3d(0, 140%, 0)'
        : dragging
          ? `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${offset.y < 0 ? 1 + Math.min(-offset.y, 60) / 2000 : 1})`
          : undefined;
  const opacity =
    leaving !== null
      ? 0
      : offset.x !== 0
        ? Math.max(0.35, 1 - Math.abs(offset.x) / 260)
        : offset.y > 0
          ? Math.max(0.35, 1 - offset.y / 160)
          : undefined;

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
          // Tous les gestes sur la carte sont pour elle (pas de defilement de page).
          touchAction: 'none',
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
