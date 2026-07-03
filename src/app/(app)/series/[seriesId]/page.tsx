'use client';

import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { EmptyState } from '@/components/shared/EmptyState';
import { FavoriteButton } from '@/components/shared/FavoriteButton';
import { PosterImage } from '@/components/shared/PosterImage';
import { VideoPlayer } from '@/components/player/VideoPlayer';
import { IconArrowLeft, IconPlay } from '@/components/ui/icons';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';
import * as catalogRepository from '@/db/repositories/catalogRepository';
import * as playbackRepository from '@/db/repositories/playbackRepository';
import { getSeriesDetailsCached } from '@/services/xtream/seriesDetailsService';
import { buildSeriesEpisodeUrl } from '@/services/xtream/xtreamUrls';
import { useAuthStore } from '@/stores/authStore';
import { usePlaybackStore } from '@/stores/playbackStore';
import type { Episode, PlaybackEntry, Series, SeriesDetails } from '@/types/models';
import { formatClock } from '@/utils/format';

function episodeStatus(prog: PlaybackEntry | undefined): { label: string; className: string } | null {
  if (prog === undefined || (prog.positionSec <= 0 && prog.finished === 0)) return null;
  if (prog.finished === 1) return { label: 'Terminé', className: 'text-emerald-400' };
  const pct =
    prog.durationSec !== null && prog.durationSec > 0
      ? ` · ${Math.round((prog.positionSec / prog.durationSec) * 100)}%`
      : '';
  return { label: `En cours${pct}`, className: 'text-amber-400' };
}

export default function SeriesDetailPage() {
  const { seriesId } = useParams<{ seriesId: string }>();
  const credentials = useAuthStore((s) => s.credentials);
  const saveProgress = usePlaybackStore((s) => s.saveProgress);
  const markFinished = usePlaybackStore((s) => s.markFinished);
  const router = useRouter();

  const [series, setSeries] = useState<Series | null | undefined>(undefined);
  const [details, setDetails] = useState<SeriesDetails | null | undefined>(undefined);
  const [season, setSeason] = useState<number | null>(null);
  const [playingEp, setPlayingEp] = useState<Episode | null>(null);
  const [startAt, setStartAt] = useState(0);
  const [epProgress, setEpProgress] = useState<Map<string, PlaybackEntry>>(new Map());

  useEffect(() => {
    let active = true;
    void catalogRepository.getSeriesById(seriesId).then((s) => {
      if (active) setSeries(s ?? null);
    });
    return () => {
      active = false;
    };
  }, [seriesId]);

  // Saisons/episodes charges A LA DEMANDE (cache Dexie + TTL).
  useEffect(() => {
    if (credentials === null) return;
    let active = true;
    void getSeriesDetailsCached(credentials, seriesId)
      .then((d) => {
        if (!active) return;
        setDetails(d);
        const first = d.seasons[0];
        setSeason((prev) => prev ?? first?.seasonNumber ?? null);
      })
      .catch(() => {
        if (active) setDetails(null);
      });
    return () => {
      active = false;
    };
  }, [credentials, seriesId]);

  const refreshProgress = useCallback(async () => {
    setEpProgress(await playbackRepository.getSeriesEpisodeProgress(seriesId));
  }, [seriesId]);

  useEffect(() => {
    void refreshProgress();
  }, [refreshProgress, playingEp]);

  const episodes = useMemo(
    () =>
      details !== null && details !== undefined && season !== null
        ? details.episodes.filter((e) => e.seasonNumber === season)
        : [],
    [details, season],
  );

  const playEpisode = (ep: Episode) => {
    const prog = epProgress.get(ep.id);
    setStartAt(prog !== undefined && prog.finished === 0 && prog.positionSec > 30 ? prog.positionSec : 0);
    setPlayingEp(ep);
  };

  const src =
    playingEp !== null && credentials !== null
      ? buildSeriesEpisodeUrl(credentials, playingEp.id, playingEp.containerExtension)
      : null;

  if (series === null) {
    return (
      <main className="mx-auto w-full max-w-4xl px-4 py-6 md:px-8">
        <EmptyState title="Série introuvable" hint="Elle a peut-être disparu du catalogue." />
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-6 md:px-8">
      <div className="mb-4 flex items-center gap-3">
        <button
          onClick={() => router.back()}
          aria-label="Retour"
          className="rounded-full bg-ink-800 p-2 text-fg-muted hover:text-fg"
        >
          <IconArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="min-w-0 flex-1 truncate text-lg font-semibold text-fg">{series?.name ?? ''}</h1>
        <FavoriteButton type="series" itemId={seriesId} />
      </div>

      {playingEp !== null && src !== null ? (
        <div className="mb-6">
          <VideoPlayer
            src={src}
            startAt={startAt}
            poster={series?.posterUrl ?? null}
            onProgress={(pos, dur) =>
              saveProgress({
                type: 'episode',
                itemId: playingEp.id,
                seriesId,
                positionSec: pos,
                durationSec: dur,
                label: `${series?.name ?? 'Série'} · S${playingEp.seasonNumber}E${playingEp.episodeNumber}`,
                posterUrl: series?.posterUrl ?? null,
              })
            }
            onEnded={() => void markFinished('episode', playingEp.id)}
          />
          <p className="mt-2 text-sm text-fg-muted">
            S{playingEp.seasonNumber}E{playingEp.episodeNumber} · {playingEp.title}
          </p>
        </div>
      ) : (
        series !== undefined && (
          <div className="mb-6 flex animate-fade-in gap-5">
            <PosterImage
              src={series.posterUrl}
              alt={series.name}
              className="aspect-[2/3] w-28 shrink-0 rounded-2xl sm:w-36"
            />
            <div className="min-w-0 flex-1">
              <p className="text-xs text-fg-faint">
                {[
                  series.releaseDate?.slice(0, 4) ?? null,
                  series.genre,
                  series.rating !== null ? `★ ${series.rating.toFixed(1)}` : null,
                ]
                  .filter((v): v is string => v !== null)
                  .join(' · ')}
              </p>
              {series.plot !== null && (
                <p className="mt-2 line-clamp-4 text-sm leading-relaxed text-fg-muted">{series.plot}</p>
              )}
            </div>
          </div>
        )
      )}

      {details === undefined && (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-14 rounded-xl" />
          ))}
        </div>
      )}
      {details === null && (
        <EmptyState
          title="Épisodes indisponibles"
          hint="Impossible de charger les saisons depuis le serveur. Réessaie plus tard."
        />
      )}

      {details !== null && details !== undefined && (
        <>
          <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
            {details.seasons.map((s) => (
              <button
                key={s.seasonNumber}
                onClick={() => setSeason(s.seasonNumber)}
                className={cn(
                  'shrink-0 rounded-full px-4 py-1.5 text-xs font-medium transition-colors',
                  s.seasonNumber === season
                    ? 'bg-accent text-white'
                    : 'bg-ink-800 text-fg-muted hover:text-fg',
                )}
              >
                Saison {s.seasonNumber}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-1">
            {episodes.map((ep) => {
              const status = episodeStatus(epProgress.get(ep.id));
              return (
                <button
                  key={ep.id}
                  onClick={() => playEpisode(ep)}
                  className={cn(
                    'flex items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-ink-800',
                    playingEp?.id === ep.id && 'bg-ink-700',
                  )}
                >
                  <span className="w-8 shrink-0 text-center text-sm font-semibold text-fg-faint">
                    {ep.episodeNumber}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-fg">{ep.title}</span>
                    {status !== null && (
                      <span className={cn('text-[11px]', status.className)}>{status.label}</span>
                    )}
                  </span>
                  {ep.durationSecs !== null && (
                    <span className="shrink-0 text-[11px] text-fg-faint">{formatClock(ep.durationSecs)}</span>
                  )}
                  <IconPlay className="h-4 w-4 shrink-0 text-fg-faint" />
                </button>
              );
            })}
            {episodes.length === 0 && <EmptyState title="Aucun épisode dans cette saison" />}
          </div>
        </>
      )}
    </main>
  );
}
