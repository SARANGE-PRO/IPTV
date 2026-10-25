'use client';

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { IconPauseFilled, IconPlayFilled } from '@/components/player/playerIcons';
import { IconX } from '@/components/ui/icons';
import { cn } from '@/lib/cn';
import { pauseByUser } from '@/services/player/playbackIntent';
import type { NowPlayingMedia } from '@/types/nowPlaying';
import './miniPlayer.css';

/** Glissement lateral (px) au-dela duquel on ferme. */
const DISMISS_DISTANCE = 120;
/** Glissement vers le haut (px) : revenir en grand. */
const EXPAND_DISTANCE = 72;
/** Glissement vers le bas (px) : fermer. */
const CLOSE_DISTANCE = 96;
/** Fermeture par glissement : delai pendant lequel « Annuler » la rattrape. */
const UNDO_MS = 4000;
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
 * le bas ou sur le cote = fermer, rattrapable 4 s (« Annuler ») ; la croix
 * ferme tout de suite.
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
  // Fermeture par glissement en attente : la carte est sortie, la lecture en
  // pause ; « Annuler » la ramene, sinon on ferme pour de bon.
  const [undoing, setUndoing] = useState(false);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const clearUndo = () => {
    if (undoTimer.current !== null) clearTimeout(undoTimer.current);
    undoTimer.current = null;
  };
  useEffect(() => clearUndo, []);

  const dismissWithUndo = (direction: 'left' | 'right' | 'down') => {
    setLeaving(direction);
    if (video !== null && !video.paused) pauseByUser(video);
    setUndoing(true);
    clearUndo();
    undoTimer.current = setTimeout(() => {
      undoTimer.current = null;
      setUndoing(false);
      onCloseRef.current();
    }, UNDO_MS);
  };
  const undoDismiss = () => {
    clearUndo();
    setUndoing(false);
    setLeaving(null);
    setOffset({ x: 0, y: 0 });
    if (video !== null && video.paused) void video.play().catch(() => {});
  };

  // Une AUTRE lecture demarre pendant « Annuler » (episode suivant, ⏭ de
  // l'ecran verrouille) : la fermeture differee visait l'ancienne, on l'oublie.
  const mediaKey = media === null ? null : `${media.kind}:${media.itemId}`;
  useEffect(() => {
    clearUndo();
    setUndoing(false);
    setLeaving(null);
    setOffset({ x: 0, y: 0 });
  }, [mediaKey]);

  const rootRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (mode !== 'mini') {
      clearUndo();
      setUndoing(false);
      setOffset({ x: 0, y: 0 });
      setLeaving(null);
      // Atterrissage d'un geste termine : la prochaine entree sera animee.
      rootRef.current?.removeAttribute('data-enter');
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
      dismissWithUndo(dx > 0 ? 'right' : 'left');
    } else if (d.axis === 'y' && dy <= -EXPAND_DISTANCE) {
      setOffset({ x: 0, y: 0 });
      onExpand();
    } else if (d.axis === 'y' && dy >= CLOSE_DISTANCE) {
      dismissWithUndo('down');
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
    else pauseByUser(video);
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
      ref={rootRef}
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
        className="relative flex h-16 items-stretch overflow-hidden rounded-2xl border border-white/10 bg-ink-800 shadow-2xl shadow-black/60 mini-card:h-auto mini-card:flex-col"
      >
        {/* Video (deplacee ici par PlayerHost). Tap = revenir en grand. */}
        <button
          type="button"
          onClick={guardClick(onExpand)}
          aria-label={media !== null ? `Agrandir ${media.title}` : 'Agrandir'}
          className="relative aspect-video h-full shrink-0 overflow-hidden bg-black mini-card:h-auto mini-card:w-full"
        >
          <div ref={dockRef} className="pointer-events-none h-full w-full" />
          {live && (
            <span className="pointer-events-none absolute left-1.5 top-1.5 flex items-center gap-1 rounded bg-accent px-1 py-px text-[9px] font-bold uppercase tracking-wider text-white">
              <span className="h-1 w-1 animate-pulse rounded-full bg-white" />
              Direct
            </span>
          )}
        </button>

        <div className="flex min-w-0 flex-1 items-center gap-2 pl-3 pr-1.5 mini-card:py-2">
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
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-fg transition-colors hover:bg-white/10 active:bg-white/15 disabled:opacity-40"
          >
            {paused ? <IconPlayFilled className="h-5 w-5" /> : <IconPauseFilled className="h-5 w-5" />}
          </button>
          <button
            type="button"
            onClick={guardClick(onClose)}
            aria-label="Fermer le lecteur"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-white/10 hover:text-fg active:bg-white/15"
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
      {undoing && (
        <div
          role="status"
          className="absolute inset-x-0 bottom-0 flex h-14 items-center justify-between gap-3 rounded-2xl bg-ink-700 pl-4 pr-1.5 shadow-2xl shadow-black/60"
        >
          <span className="truncate text-sm text-fg">Lecture fermée</span>
          <button
            type="button"
            onClick={undoDismiss}
            className="h-11 shrink-0 rounded-xl px-4 text-sm font-semibold text-accent hover:bg-white/5"
          >
            Annuler
          </button>
        </div>
      )}
    </div>
  );
}
