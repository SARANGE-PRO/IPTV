'use client';

import { EpisodeRow } from '@/components/series/EpisodeRow';
import { EmptyState } from '@/components/shared/EmptyState';
import { HScroll } from '@/components/shared/HScroll';
import { IconCheck } from '@/components/ui/icons';
import { cn } from '@/lib/cn';
import { watchedRatio } from '@/services/media/episodeService';
import type { Episode, PlaybackEntry, SeriesDetails } from '@/types/models';

/**
 * Saisons (pastilles) + « Saison vue » + episodes de la saison choisie
 * (vignette, progression, synopsis, vu / non vu).
 */
export function SeasonEpisodes({
  seasons,
  season,
  episodes,
  progress,
  playingId,
  fallbackImage,
  onSelectSeason,
  onPlay,
  onToggleWatched,
}: {
  seasons: SeriesDetails['seasons'];
  season: number | null;
  /** Episodes de la saison affichee. */
  episodes: Episode[];
  progress: ReadonlyMap<string, PlaybackEntry>;
  playingId: string | null;
  fallbackImage: string | null;
  onSelectSeason: (season: number) => void;
  onPlay: (episode: Episode) => void;
  onToggleWatched: (episodes: Episode[], watched: boolean) => void;
}) {
  const seasonWatched = episodes.length > 0 && episodes.every((ep) => progress.get(ep.id)?.finished === 1);
  return (
    <>
      <div className="mb-3 flex items-center gap-2">
        <HScroll className="flex min-w-0 flex-1 gap-2 pb-1 [scrollbar-width:none]">
          {seasons.map((s) => (
            <button
              key={s.seasonNumber}
              type="button"
              aria-pressed={s.seasonNumber === season}
              onClick={() => onSelectSeason(s.seasonNumber)}
              className={cn(
                'shrink-0 rounded-full px-4 py-2.5 text-[13px] font-medium transition-colors',
                s.seasonNumber === season ? 'bg-accent text-white' : 'bg-ink-800 text-fg-muted hover:text-fg',
              )}
            >
              Saison {s.seasonNumber}
            </button>
          ))}
        </HScroll>
        {episodes.length > 0 && (
          <button
            type="button"
            onClick={() => onToggleWatched(episodes, !seasonWatched)}
            className="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2.5 text-xs font-medium text-fg-faint transition-colors hover:bg-ink-800 hover:text-fg"
          >
            <IconCheck className="h-3.5 w-3.5" />
            {seasonWatched ? 'Saison non vue' : 'Saison vue'}
          </button>
        )}
      </div>

      <div className="flex flex-col gap-1">
        {episodes.map((ep) => {
          const prog = progress.get(ep.id);
          return (
            <EpisodeRow
              key={ep.id}
              episode={ep}
              fallbackImage={fallbackImage}
              ratio={watchedRatio(prog, ep.durationSecs)}
              watched={prog?.finished === 1}
              playing={playingId === ep.id}
              onPlay={() => onPlay(ep)}
              onToggleWatched={() => onToggleWatched([ep], prog?.finished !== 1)}
            />
          );
        })}
        {episodes.length === 0 && <EmptyState title="Aucun épisode dans cette saison" />}
      </div>
    </>
  );
}
