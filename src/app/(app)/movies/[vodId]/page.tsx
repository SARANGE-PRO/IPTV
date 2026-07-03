'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { EmptyState } from '@/components/shared/EmptyState';
import { FavoriteButton } from '@/components/shared/FavoriteButton';
import { PosterImage } from '@/components/shared/PosterImage';
import { ExternalPlayer } from '@/components/player/ExternalPlayer';
import { VideoPlayer } from '@/components/player/VideoPlayer';
import { Button } from '@/components/ui/Button';
import { IconArrowLeft, IconPlay } from '@/components/ui/icons';
import * as catalogRepository from '@/db/repositories/catalogRepository';
import * as playbackRepository from '@/db/repositories/playbackRepository';
import { resolveDuration, parseDurationToSeconds } from '@/services/player/mediaDurationService';
import { progressRatio, shouldOfferResume } from '@/services/player/resumePlaybackService';
import { tmdbBackdrop, tmdbPoster } from '@/services/tmdb/tmdbImage';
import * as xtreamApi from '@/services/xtream/xtreamApi';
import { buildVodStreamUrl } from '@/services/xtream/xtreamUrls';
import { useTmdbMetadata } from '@/hooks/useTmdbMetadata';
import { useAuthStore } from '@/stores/authStore';
import { usePlaybackStore } from '@/stores/playbackStore';
import { useUiSettingsStore } from '@/stores/uiSettingsStore';
import type { Movie, PlaybackEntry } from '@/types/models';
import { displayTitle, displayYear } from '@/utils/displayTitle';
import { formatClock } from '@/utils/format';

export default function MovieDetailPage() {
  const { vodId } = useParams<{ vodId: string }>();
  const credentials = useAuthStore((s) => s.credentials);
  const saveProgress = usePlaybackStore((s) => s.saveProgress);
  const markFinished = usePlaybackStore((s) => s.markFinished);
  const showVlcButton = useUiSettingsStore((s) => s.showVlcButton);
  const router = useRouter();

  const [movie, setMovie] = useState<Movie | null | undefined>(undefined);
  const [progress, setProgress] = useState<PlaybackEntry | null>(null);
  const [plot, setPlot] = useState<string | null>(null);
  const [xtreamPoster, setXtreamPoster] = useState<string | null>(null);
  const [xtreamBackdrop, setXtreamBackdrop] = useState<string | null>(null);
  const [xtreamDurationSecs, setXtreamDurationSecs] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [startAt, setStartAt] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    void catalogRepository.getMovieById(vodId).then((m) => {
      if (active) setMovie(m ?? null);
    });
    void playbackRepository.getProgress('vod', vodId).then((p) => {
      if (active) setProgress(p ?? null);
    });
    return () => {
      active = false;
    };
  }, [vodId]);

  // Synopsis a la demande (non bloquant, jamais indispensable).
  useEffect(() => {
    if (credentials === null) return;
    let active = true;
    void xtreamApi
      .getVodInfo(credentials, vodId)
      .then((info) => {
        if (!active) return;
        setPlot(info.info?.plot ?? info.info?.description ?? null);
        setXtreamPoster(info.info?.movie_image ?? info.info?.cover ?? null);
        const backdrop = info.info?.backdrop_path;
        setXtreamBackdrop(Array.isArray(backdrop) ? (backdrop[0] ?? null) : (backdrop ?? null));
        setXtreamDurationSecs(
          parseDurationToSeconds(info.info?.duration_secs ?? info.info?.duration ?? null),
        );
      })
      .catch(() => {
        // silencieux : le detail reste utilisable sans synopsis
      });
    return () => {
      active = false;
    };
  }, [credentials, vodId]);

  const tmdb = useTmdbMetadata('movie', movie?.name ?? null, movie?.year ?? null);
  const tmdbPosterUrl = tmdbPoster(tmdb?.posterPath ?? null);
  const posterFallbackUrl = xtreamPoster ?? movie?.posterUrl ?? null;
  const posterUrl = tmdbPosterUrl ?? posterFallbackUrl;
  const backdropUrl = tmdbBackdrop(tmdb?.backdropPath ?? null) ?? xtreamBackdrop;
  const overview = tmdb?.overview ?? plot;
  const rating = tmdb?.voteAverage ?? movie?.rating ?? null;

  const src = useMemo(
    () =>
      credentials !== null && movie !== null && movie !== undefined
        ? buildVodStreamUrl(credentials, movie.id, movie.containerExtension)
        : null,
    [credentials, movie],
  );

  // Duree de repli (Xtream puis TMDB) quand le player n'expose pas de duree fiable.
  const fallbackDuration = resolveDuration({
    xtreamSeconds: xtreamDurationSecs,
    tmdbSeconds: tmdb?.runtimeMinutes != null ? tmdb.runtimeMinutes * 60 : null,
  }).seconds;
  const effResumeDuration = progress?.durationSec ?? fallbackDuration;
  const canResume =
    progress !== null && progress.finished === 0 && shouldOfferResume(progress.positionSec, effResumeDuration);
  const ratio = progress !== null ? progressRatio(progress.positionSec, effResumeDuration) : null;

  const play = (from: number) => {
    setStartAt(from);
    setFailed(false);
    setPlaying(true);
  };

  if (movie === null) {
    return (
      <main className="mx-auto w-full max-w-4xl px-4 py-6 md:px-8">
        <EmptyState title="Film introuvable" hint="Il a peut-être disparu du catalogue." />
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
        <h1 className="min-w-0 flex-1 truncate text-lg font-semibold text-fg">
          {movie != null ? displayTitle(movie.name) : ''}
        </h1>
        <FavoriteButton type="vod" itemId={vodId} />
      </div>

      {playing && src !== null && movie !== undefined ? (
        <div className="space-y-3">
          <VideoPlayer
            src={src}
            startAt={startAt}
            duration={fallbackDuration}
            poster={backdropUrl ?? posterUrl}
            onProgress={(pos, dur) =>
              saveProgress({
                type: 'vod',
                itemId: vodId,
                positionSec: pos,
                durationSec: dur,
                label: movie.name,
                posterUrl,
              })
            }
            onEnded={() => void markFinished('vod', vodId)}
            onError={() => setFailed(true)}
          />
          {(showVlcButton || failed) && (
            <ExternalPlayer
              streamUrl={src}
              label={failed ? 'Ça ne marche pas ici ? Ouvrir dans VLC' : 'Lire dans VLC'}
            />
          )}
        </div>
      ) : (
        movie !== undefined && (
          <div className="flex animate-fade-in flex-col gap-6 sm:flex-row">
            <div className="w-40 shrink-0 sm:w-52">
              <div className="relative">
                <PosterImage
                  src={posterUrl}
                  fallbackSrc={tmdbPosterUrl !== null ? posterFallbackUrl : null}
                  alt={movie.name}
                  className="aspect-[2/3] w-full rounded-2xl"
                />
                {ratio !== null && ratio > 0 && (
                  <div className="absolute inset-x-0 bottom-0 h-1 rounded-b-2xl bg-black/50">
                    <div className="h-full bg-accent" style={{ width: `${Math.min(ratio * 100, 100)}%` }} />
                  </div>
                )}
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-fg-faint">
                {[
                  movie.year !== null
                    ? String(movie.year)
                    : (tmdb?.releaseDate?.slice(0, 4) ?? displayYear(movie.name, null)?.toString() ?? null),
                  rating !== null ? `★ ${rating.toFixed(1)}` : null,
                  tmdb?.runtimeMinutes != null ? `${tmdb.runtimeMinutes} min` : null,
                  movie.containerExtension?.toUpperCase() ?? null,
                ]
                  .filter((v): v is string => v !== null)
                  .join(' · ')}
              </p>
              {tmdb !== null && tmdb.genres.length > 0 && (
                <p className="mt-1 text-xs text-fg-faint">{tmdb.genres.join(' · ')}</p>
              )}
              {overview !== null && <p className="mt-3 text-sm leading-relaxed text-fg-muted">{overview}</p>}
              {tmdb !== null && tmdb.cast.length > 0 && (
                <p className="mt-3 text-xs text-fg-faint">
                  <span className="text-fg-muted">Avec </span>
                  {tmdb.cast.slice(0, 5).map((c) => c.name).join(', ')}
                </p>
              )}
              <div className="mt-6 flex flex-wrap items-start gap-3">
                <Button size="lg" onClick={() => play(canResume && progress !== null ? progress.positionSec : 0)}>
                  <IconPlay className="mr-2 h-4 w-4" />
                  {canResume && progress !== null ? `Reprendre (${formatClock(progress.positionSec)})` : 'Lire'}
                </Button>
                {canResume && (
                  <Button size="lg" variant="secondary" onClick={() => play(0)}>
                    Recommencer
                  </Button>
                )}
                {showVlcButton && src !== null && <ExternalPlayer streamUrl={src} label="Lire dans VLC" />}
              </div>
            </div>
          </div>
        )
      )}
    </main>
  );
}
