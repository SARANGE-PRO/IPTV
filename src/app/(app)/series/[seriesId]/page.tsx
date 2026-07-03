'use client';

import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { EmptyState } from '@/components/shared/EmptyState';
import { FavoriteButton } from '@/components/shared/FavoriteButton';
import { HScroll } from '@/components/shared/HScroll';
import { PosterImage } from '@/components/shared/PosterImage';
import { ExternalPlayer } from '@/components/player/ExternalPlayer';
import { VideoPlayer } from '@/components/player/VideoPlayer';
import { Button } from '@/components/ui/Button';
import { IconArrowLeft, IconPlay } from '@/components/ui/icons';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';
import * as catalogRepository from '@/db/repositories/catalogRepository';
import * as playbackRepository from '@/db/repositories/playbackRepository';
import { getSeriesDetailsCached } from '@/services/xtream/seriesDetailsService';
import { tmdbPoster } from '@/services/tmdb/tmdbImage';
import { buildSeriesEpisodeUrl } from '@/services/xtream/xtreamUrls';
import { usePlaybackPlan } from '@/hooks/usePlaybackPlan';
import { useTmdbMetadata } from '@/hooks/useTmdbMetadata';
import { useAuthStore } from '@/stores/authStore';
import { usePlaybackStore } from '@/stores/playbackStore';
import { useUiSettingsStore } from '@/stores/uiSettingsStore';
import type { Episode, PlaybackEntry, Series, SeriesDetails } from '@/types/models';
import { displayTitle } from '@/utils/displayTitle';
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
  const showVlcButton = useUiSettingsStore((s) => s.showVlcButton);
  const router = useRouter();

  const [series, setSeries] = useState<Series | null | undefined>(undefined);
  const [details, setDetails] = useState<SeriesDetails | null | undefined>(undefined);
  const [season, setSeason] = useState<number | null>(null);
  const [playingEp, setPlayingEp] = useState<Episode | null>(null);
  const [startAt, setStartAt] = useState(0);
  const [failed, setFailed] = useState(false);
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

  const seriesYear = series?.releaseDate != null ? Number.parseInt(series.releaseDate.slice(0, 4), 10) : null;
  const tmdb = useTmdbMetadata('series', series?.name ?? null, Number.isFinite(seriesYear) ? seriesYear : null);
  const tmdbPosterUrl = tmdbPoster(tmdb?.posterPath ?? null);
  const posterUrl = tmdbPosterUrl ?? series?.posterUrl ?? null;
  const overview = tmdb?.overview ?? series?.plot ?? null;
  const rating = tmdb?.voteAverage ?? series?.rating ?? null;
  const genres = tmdb !== null && tmdb.genres.length > 0 ? tmdb.genres.join(' · ') : (series?.genre ?? null);

  const episodes = useMemo(
    () =>
      details !== null && details !== undefined && season !== null
        ? details.episodes.filter((e) => e.seasonNumber === season)
        : [],
    [details, season],
  );

  // Prochaine reprise : l'episode en cours le plus recemment regarde.
  const resumeEpisode = useMemo(() => {
    if (details === null || details === undefined) return null;
    let best: { ep: Episode; at: number } | null = null;
    for (const ep of details.episodes) {
      const prog = epProgress.get(ep.id);
      if (prog !== undefined && prog.finished === 0 && prog.positionSec > 30) {
        if (best === null || prog.updatedAt > best.at) best = { ep, at: prog.updatedAt };
      }
    }
    return best?.ep ?? null;
  }, [details, epProgress]);

  const playEpisode = (ep: Episode) => {
    const prog = epProgress.get(ep.id);
    setStartAt(prog !== undefined && prog.finished === 0 && prog.positionSec > 30 ? prog.positionSec : 0);
    setFailed(false);
    setPlayingEp(ep);
  };

  const src =
    playingEp !== null && credentials !== null
      ? buildSeriesEpisodeUrl(credentials, playingEp.id, playingEp.containerExtension)
      : null;

  // Plan de lecture adaptatif selon le conteneur de l'episode courant.
  const plan = usePlaybackPlan(playingEp?.containerExtension ?? null);

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
        <h1 className="min-w-0 flex-1 truncate text-lg font-semibold text-fg">
          {series != null ? displayTitle(series.name) : ''}
        </h1>
        <FavoriteButton type="series" itemId={seriesId} />
      </div>

      {playingEp !== null && src !== null ? (
        <div className="mb-6 space-y-4">
          {plan === 'vlc-only' ? (
            <div className="rounded-2xl bg-ink-800 p-6 text-center">
              <p className="text-sm text-fg">
                Cet épisode est en {playingEp.containerExtension?.toUpperCase() ?? 'un format non lisible'} — un
                iPhone ou iPad ne le décode pas dans le navigateur.
              </p>
              <p className="mt-1.5 text-xs text-fg-muted">
                Allume la passerelle pour le lire ici, ou ouvre-le dans VLC (lecture native).
              </p>
              <ExternalPlayer
                className="mt-4"
                streamUrl={src}
                label={`Ouvrir S${playingEp.seasonNumber}E${playingEp.episodeNumber} dans VLC`}
              />
            </div>
          ) : plan === 'checking' ? (
            <div className="flex aspect-video items-center justify-center rounded-2xl bg-black">
              <span className="h-8 w-8 animate-spin rounded-full border-2 border-ink-500 border-t-accent" />
            </div>
          ) : (
            <>
              {(showVlcButton || failed) && (
                <ExternalPlayer
                  streamUrl={src}
                  label={
                    failed
                      ? 'Ça ne marche pas ici ? Ouvrir dans VLC'
                      : `Lire S${playingEp.seasonNumber}E${playingEp.episodeNumber} dans VLC`
                  }
                />
              )}
              <VideoPlayer
                src={src}
                transcode={plan === 'gateway'}
                contentType="episode"
                container={playingEp.containerExtension}
                startAt={startAt}
                duration={playingEp.durationSecs}
                poster={posterUrl}
                onProgress={(pos, dur) =>
                  saveProgress({
                    type: 'episode',
                    itemId: playingEp.id,
                    seriesId,
                    positionSec: pos,
                    durationSec: dur,
                    label: `${series?.name ?? 'Série'} · S${playingEp.seasonNumber}E${playingEp.episodeNumber}`,
                    posterUrl,
                  })
                }
                onEnded={() => void markFinished('episode', playingEp.id)}
                onError={() => setFailed(true)}
              />
            </>
          )}
          <p className="mt-2 text-sm text-fg-muted">
            S{playingEp.seasonNumber}E{playingEp.episodeNumber} · {playingEp.title}
          </p>
        </div>
      ) : (
        series !== undefined && (
          <div className="mb-6 flex animate-fade-in gap-5">
            <PosterImage
              src={posterUrl}
              fallbackSrc={tmdbPosterUrl !== null ? (series.posterUrl ?? null) : null}
              alt={series.name}
              className="aspect-[2/3] w-28 shrink-0 rounded-2xl sm:w-36"
            />
            <div className="min-w-0 flex-1">
              <p className="text-xs text-fg-faint">
                {[
                  series.releaseDate?.slice(0, 4) ?? (tmdb?.releaseDate?.slice(0, 4) ?? null),
                  genres,
                  rating !== null ? `★ ${rating.toFixed(1)}` : null,
                ]
                  .filter((v): v is string => v !== null)
                  .join(' · ')}
              </p>
              {overview !== null && (
                <p className="mt-2 line-clamp-4 text-sm leading-relaxed text-fg-muted">{overview}</p>
              )}
              {tmdb !== null && tmdb.cast.length > 0 && (
                <p className="mt-2 text-xs text-fg-faint">
                  <span className="text-fg-muted">Avec </span>
                  {tmdb.cast.slice(0, 5).map((c) => c.name).join(', ')}
                </p>
              )}
              {resumeEpisode !== null && (
                <div className="mt-4">
                  <Button size="sm" onClick={() => playEpisode(resumeEpisode)}>
                    <IconPlay className="mr-2 h-4 w-4" />
                    Reprendre S{resumeEpisode.seasonNumber}E{resumeEpisode.episodeNumber}
                  </Button>
                </div>
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
          <HScroll className="mb-3 flex gap-2 pb-1">
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
          </HScroll>

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
