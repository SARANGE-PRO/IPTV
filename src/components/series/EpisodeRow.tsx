'use client';

import { PosterImage } from '@/components/shared/PosterImage';
import { IconCheck, IconPlay } from '@/components/ui/icons';
import { cn } from '@/lib/cn';
import type { Episode } from '@/types/models';
import { formatClock } from '@/utils/format';

/**
 * Ligne d'episode facon Netflix : vignette 16:9 + barre de progression,
 * numero, titre, duree, synopsis court, bouton « vu » (bascule).
 */
export function EpisodeRow({
  episode,
  fallbackImage,
  ratio,
  watched,
  playing,
  onPlay,
  onToggleWatched,
}: {
  episode: Episode;
  fallbackImage: string | null;
  /** 0..1 vu, null si jamais lance. */
  ratio: number | null;
  watched: boolean;
  playing: boolean;
  onPlay: () => void;
  onToggleWatched: () => void;
}) {
  const minutes = episode.durationSecs !== null && episode.durationSecs > 0 ? Math.round(episode.durationSecs / 60) : null;
  return (
    <div
      className={cn(
        'group flex gap-3 rounded-2xl p-2 transition-colors hover:bg-ink-800 sm:gap-4',
        playing && 'bg-ink-800 ring-1 ring-accent/40',
      )}
    >
      <button
        type="button"
        onClick={onPlay}
        aria-label={`Lire l’épisode ${episode.episodeNumber} : ${episode.title}`}
        className="relative w-32 shrink-0 overflow-hidden rounded-xl bg-ink-800 sm:w-40"
      >
        <PosterImage
          src={episode.imageUrl ?? fallbackImage}
          fallbackSrc={fallbackImage}
          alt=""
          className="aspect-video w-full transition-transform duration-500 group-hover:scale-105"
        />
        <span className="absolute inset-0 m-auto grid h-9 w-9 place-items-center rounded-full bg-black/55 ring-1 ring-white/30 opacity-90 backdrop-blur-sm">
          <IconPlay className="ml-0.5 h-4 w-4 text-white" />
        </span>
        {ratio !== null && ratio > 0 && (
          <span className="absolute inset-x-0 bottom-0 h-1 bg-white/25">
            <span className="block h-full bg-accent" style={{ width: `${Math.min(ratio * 100, 100)}%` }} />
          </span>
        )}
      </button>
      <div className="min-w-0 flex-1 py-0.5">
        <div className="flex items-start gap-2">
          <button type="button" onClick={onPlay} className="min-w-0 flex-1 text-left">
            <span className="block truncate text-sm font-medium text-fg">
              {episode.episodeNumber}. {episode.title}
            </span>
            <span className="text-[11px] text-fg-faint">
              {minutes !== null ? `${minutes} min` : episode.durationSecs !== null ? formatClock(episode.durationSecs) : ''}
            </span>
          </button>
          <button
            type="button"
            onClick={onToggleWatched}
            aria-pressed={watched}
            aria-label={watched ? 'Marquer comme non vu' : 'Marquer comme vu'}
            title={watched ? 'Vu — marquer comme non vu' : 'Marquer comme vu'}
            className={cn(
              'relative hit-44 grid h-9 w-9 shrink-0 place-items-center rounded-full border transition-colors',
              watched
                ? 'border-emerald-400/60 bg-emerald-400/15 text-emerald-300'
                : 'border-ink-600 text-fg-faint hover:border-ink-500 hover:text-fg',
            )}
          >
            <IconCheck className="h-3.5 w-3.5" />
          </button>
        </div>
        {episode.plot !== null && (
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-fg-muted">{episode.plot}</p>
        )}
      </div>
    </div>
  );
}
