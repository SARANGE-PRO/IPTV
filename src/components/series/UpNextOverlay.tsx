'use client';

import { useEffect, useRef, useState } from 'react';
import { IconSkipNext } from '@/components/ui/icons';
import type { Episode } from '@/types/models';

const COUNTDOWN_S = 8;

/**
 * Fin d'episode : « Episode suivant dans 8 s » (facon Netflix), avec
 * « Lire maintenant » et « Annuler ». Le compte a rebours tourne meme si la
 * video est en plein ecran natif iOS (la bascule se fait alors toute seule).
 */
export function UpNextOverlay({
  episode,
  onPlay,
  onCancel,
}: {
  episode: Episode;
  onPlay: () => void;
  onCancel: () => void;
}) {
  const [left, setLeft] = useState(COUNTDOWN_S);
  // Ref : un nouveau rendu du parent (callback recree) ne relance pas le decompte.
  const onPlayRef = useRef(onPlay);
  onPlayRef.current = onPlay;

  useEffect(() => {
    if (left <= 0) {
      onPlayRef.current();
      return;
    }
    const id = window.setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => window.clearTimeout(id);
  }, [left]);

  return (
    <div className="absolute inset-0 z-20 flex items-end justify-end bg-gradient-to-t from-black/85 via-black/40 to-transparent p-4 sm:p-6">
      <div className="w-full max-w-xs rounded-2xl bg-ink-900/95 p-4 shadow-2xl ring-1 ring-white/10 backdrop-blur">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-fg-faint">
          Épisode suivant dans {left} s
        </p>
        <p className="mt-1 truncate text-sm font-medium text-fg">
          S{episode.seasonNumber} E{episode.episodeNumber} · {episode.title}
        </p>
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/15">
          <div
            className="h-full bg-accent transition-[width] duration-1000 ease-linear"
            style={{ width: `${((COUNTDOWN_S - left) / COUNTDOWN_S) * 100}%` }}
          />
        </div>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={onPlay}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-white py-2 text-sm font-semibold text-black hover:bg-white/85"
          >
            <IconSkipNext className="h-4 w-4" />
            Lire maintenant
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl bg-white/10 px-3 py-2 text-sm font-medium text-white hover:bg-white/20"
          >
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}
