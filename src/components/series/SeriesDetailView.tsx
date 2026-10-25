'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DetailHeader } from '@/components/media/DetailHeader';
import { DetailHero } from '@/components/media/DetailHero';
import { LanguageVariantSwitcher } from '@/components/media/LanguageVariantSwitcher';
import { TitleRail } from '@/components/media/TitleRail';
import { TrailerButton } from '@/components/media/TrailerButton';
import { launchVlc } from '@/components/player/ExternalPlayer';
import { PlayerSlot } from '@/components/player/host/PlayerSlot';
import { LandscapeStage } from '@/components/player/LandscapeStage';
import { PlaybackPlanPanel } from '@/components/player/PlaybackPlanPanel';
import { SeasonEpisodes } from '@/components/series/SeasonEpisodes';
import { UpNextOverlay } from '@/components/series/UpNextOverlay';
import { ClampedText } from '@/components/shared/ClampedText';
import { EmptyState } from '@/components/shared/EmptyState';
import { ErrorState } from '@/components/shared/ErrorState';
import { PosterImage } from '@/components/shared/PosterImage';
import { Button } from '@/components/ui/Button';
import { IconPlay, IconSkipNext } from '@/components/ui/icons';
import { Skeleton } from '@/components/ui/Skeleton';
import { useMediaSession } from '@/hooks/useMediaSession';
import { useSeriesDetail } from '@/hooks/useSeriesDetail';
import { useSimilarSeries } from '@/hooks/useTitleExtras';
import { useTmdbMetadata } from '@/hooks/useTmdbMetadata';
import { useVodPlayback } from '@/hooks/useVodPlayback';
import { cn } from '@/lib/cn';
import { nextEpisode, primaryAction, resumePosition } from '@/services/media/episodeService';
import { planSourceProps } from '@/services/player/playbackPlanService';
import { nextEpisodeContinuation } from '@/services/player/seriesAutoplayService';
import { tmdbBackdrop, tmdbPoster } from '@/services/tmdb/tmdbImage';
import { buildSeriesEpisodeUrl } from '@/services/xtream/xtreamUrls';
import { useAuthStore } from '@/stores/authStore';
import { usePlaybackStore } from '@/stores/playbackStore';
import { playerSessionKey, usePlayerStore } from '@/stores/playerStore';
import { useUiSettingsStore } from '@/stores/uiSettingsStore';
import type { Episode } from '@/types/models';
import { seriesHref } from '@/utils/appRoutes';
import { displayTitle } from '@/utils/displayTitle';
import { supportsNativeHls } from '@/utils/playerSupport';
import { variantBadge } from '@/utils/variantPreference';

/**
 * Fiche SERIE facon Netflix (chantier P5) — rendue en MODAL par DetailModalHost
 * (`?series=<id>`, voir utils/appRoutes) :
 *  - bouton principal « Reprendre S1 E4 » / « Episode suivant S1 E5 » /
 *    « Lecture S1 E1 » (services/media/episodeService) ;
 *  - bande-annonce (TMDB, sinon panel), version de langue ;
 *  - episodes en cartes (vignette, progression, synopsis, « vu ») et
 *    « marquer la saison comme vue » ;
 *  - fin d'episode : compte a rebours « Episode suivant » puis lecture auto ;
 *  - titres similaires.
 * Donnees : useSeriesDetail ; plan de lecture : useVodPlayback.
 */
export function SeriesDetailView({
  seriesId,
  onBack,
  autoPlay = false,
  episodeId = null,
}: {
  seriesId: string;
  onBack?: () => void;
  /** Lance un episode des que la fiche est prete. */
  autoPlay?: boolean;
  /** Episode a lancer ; sinon action principale (reprise / suivant / 1er). */
  episodeId?: string | null;
}) {
  const credentials = useAuthStore((s) => s.credentials);
  const saveProgress = usePlaybackStore((s) => s.saveProgress);
  const markFinished = usePlaybackStore((s) => s.markFinished);
  const setWatched = usePlaybackStore((s) => s.setWatched);
  const showVlcButton = useUiSettingsStore((s) => s.showVlcButton);
  // <video> du lecteur unique, seulement quand c'est CETTE serie qui joue ici.
  const video = usePlayerStore((s) =>
    s.session?.media.kind === 'episode' && s.session.media.ownerId === seriesId ? s.video : null,
  );
  const router = useRouter();
  const close = useCallback(() => (onBack !== undefined ? onBack() : router.back()), [onBack, router]);

  const [season, setSeason] = useState<number | null>(null);
  const [playingEp, setPlayingEp] = useState<Episode | null>(null);
  const [startAt, setStartAt] = useState(0);
  const [upNext, setUpNext] = useState<Episode | null>(null);
  const { series, error, retry, variants, details, retryDetails, epProgress, progressLoaded, refreshProgress } =
    useSeriesDetail(seriesId, playingEp?.id ?? null);
  // Plan de lecture adaptatif selon le conteneur de l'episode courant.
  const playback = useVodPlayback(playingEp?.containerExtension ?? null);
  const { clearFailed } = playback;

  const allEpisodes = useMemo(() => details?.episodes ?? [], [details]);
  const primary = useMemo(() => primaryAction(allEpisodes, epProgress), [allEpisodes, epProgress]);

  // Saison affichee par defaut : celle de l'action principale (reprise / suivant).
  useEffect(() => {
    if (season !== null || details === null || details === undefined || !progressLoaded) return;
    setSeason(primary?.episode.seasonNumber ?? details.seasons[0]?.seasonNumber ?? null);
  }, [season, details, progressLoaded, primary]);

  const tmdb = useTmdbMetadata('series', series?.name ?? null, series?.year ?? null);
  const tmdbPosterUrl = tmdbPoster(tmdb?.posterPath ?? null);
  // STABILITE carte<->fiche : affiche + note depuis Xtream (TMDB = enrichissement).
  const posterUrl = series?.posterUrl ?? tmdbPosterUrl;
  const overview = tmdb?.overview ?? series?.plot ?? null;
  const rating = series !== null && series !== undefined && series.ratingSort > 0 ? series.ratingSort : null;
  const genres = tmdb !== null && tmdb.genres.length > 0 ? tmdb.genres.slice(0, 3).join(' · ') : (series?.genre ?? null);
  const trailerKey = tmdb?.trailerKey ?? details?.youtubeTrailer ?? null;
  const similar = useSimilarSeries(
    series?.groupKey ?? null,
    series !== null && series !== undefined && series.tmdbGenreIds.length > 0 ? series.tmdbGenreIds : (tmdb?.genreIds ?? []),
  );

  const episodes = useMemo(() => allEpisodes.filter((e) => e.seasonNumber === season), [allEpisodes, season]);

  // Episode choisi bas dans la liste : la fiche remonte jusqu'au lecteur (sinon
  // la lecture demarrait hors de l'ecran — le son sans l'image).
  const playerRef = useRef<HTMLDivElement | null>(null);
  const playingId = playingEp?.id ?? null;
  useEffect(() => {
    if (playingId === null) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
    playerRef.current?.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
  }, [playingId]);

  const playEpisode = useCallback(
    (ep: Episode, from?: number) => {
      setUpNext(null);
      setStartAt(from ?? resumePosition(epProgress.get(ep.id)));
      clearFailed();
      setSeason(ep.seasonNumber);
      setPlayingEp(ep);
    },
    [epProgress, clearFailed],
  );

  // Lecture directe (accueil) : episode demande, sinon action principale.
  const autoPlayedRef = useRef(false);
  useEffect(() => {
    if (!autoPlay || autoPlayedRef.current || !progressLoaded || allEpisodes.length === 0) return;
    autoPlayedRef.current = true;
    const requested = episodeId !== null ? allEpisodes.find((e) => e.id === episodeId) : undefined;
    if (requested !== undefined) playEpisode(requested);
    else if (primary !== null) playEpisode(primary.episode, primary.startAt);
  }, [autoPlay, progressLoaded, allEpisodes, episodeId, primary, playEpisode]);

  const followingEp = playingEp !== null ? nextEpisode(allEpisodes, playingEp.id) : null;
  const previousEp = useMemo(() => {
    if (playingEp === null) return null;
    const index = allEpisodes.findIndex((e) => e.id === playingEp.id);
    return index > 0 ? (allEpisodes[index - 1] ?? null) : null;
  }, [allEpisodes, playingEp]);

  // Ecran verrouille / Centre de controle : episode en cours + suivant/precedent.
  useMediaSession(
    playingEp !== null && series != null
      ? {
          title: `S${playingEp.seasonNumber} E${playingEp.episodeNumber} · ${playingEp.title}`,
          subtitle: displayTitle(series.name),
          artwork: playingEp.imageUrl ?? series.posterUrl,
        }
      : null,
    {
      onNext: followingEp !== null ? () => playEpisode(followingEp, 0) : null,
      onPrevious: previousEp !== null ? () => playEpisode(previousEp, 0) : null,
    },
  );

  // Episode suivant AUTONOME, confie au lecteur unique : il enchaine meme
  // fiche fermee (mini-lecteur) et sert le ⏭ de l'ecran verrouille.
  const continuation = useMemo(() => {
    if (playingEp === null || credentials === null || series == null) return null;
    return nextEpisodeContinuation(
      {
        credentials,
        seriesId,
        seriesName: series.name,
        seriesTitle: displayTitle(series.name),
        posterUrl,
        episodes: allEpisodes,
      },
      {
        saveProgress: (input, opts) => usePlaybackStore.getState().saveProgress(input, opts),
        markFinished: (episodeId) => void usePlaybackStore.getState().markFinished('episode', episodeId),
        play: (session, handlers) => usePlayerStore.getState().play(session, handlers),
        sessionKey: playerSessionKey,
        currentSessionKey: () => usePlayerStore.getState().session?.key ?? null,
      },
      playingEp,
    );
  }, [playingEp, credentials, series, seriesId, posterUrl, allEpisodes]);

  const handleEnded = (ep: Episode) => {
    void markFinished('episode', ep.id);
    const next = nextEpisode(allEpisodes, ep.id);
    if (next !== null) setUpNext(next);
  };

  const episodeLabel = (ep: Episode): string =>
    `${series?.name ?? 'Série'} · S${ep.seasonNumber}E${ep.episodeNumber}`;

  const toggleWatched = async (list: Episode[], watched: boolean) => {
    // Toute une saison d'un coup : confirmation (un tap rate effacait les reprises).
    if (list.length > 1) {
      const message = watched
        ? `Marquer les ${list.length} épisodes de la saison comme vus ?`
        : `Marquer les ${list.length} épisodes comme non vus ? Leur progression sera effacée.`;
      if (!window.confirm(message)) return;
    }
    await setWatched(
      {
        type: 'episode',
        seriesId,
        items: list.map((ep) => ({ itemId: ep.id, durationSec: ep.durationSecs, label: episodeLabel(ep) })),
        posterUrl,
      },
      watched,
    );
    await refreshProgress();
  };

  // Diffuser sur la TV : l'episode en cours, sinon celui que « Reprendre » lancerait.
  const castEpisode = playingEp ?? primary?.episode ?? null;

  const src =
    playingEp !== null && credentials !== null
      ? buildSeriesEpisodeUrl(credentials, playingEp.id, playingEp.containerExtension)
      : null;

  if (error) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-6 md:px-8">
        <ErrorState title="Impossible d’ouvrir cette série" onRetry={retry} />
      </div>
    );
  }
  if (series === null) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-6 md:px-8">
        <EmptyState title="Série introuvable" hint="Elle a peut-être disparu du catalogue." />
      </div>
    );
  }

  const heroBackdrop = tmdbBackdrop(tmdb?.backdropPath ?? null) ?? series?.backdropUrl ?? null;
  const inPlayer = playingEp !== null && src !== null;
  const badge = series != null ? variantBadge(series.variant, series.variantSource) : null;
  const year = series?.tmdbYear ?? series?.year ?? null;
  const title = series != null ? displayTitle(series.name) : '';

  return (
    <div className="mx-auto w-full max-w-4xl">
      {!inPlayer && <DetailHero backdropUrl={heroBackdrop} />}

      <div className={cn('px-4 pb-8 md:px-8', inPlayer ? 'pt-6' : 'relative -mt-16 sm:-mt-24')}>
        <DetailHeader
          type="series"
          itemId={seriesId}
          title={title}
          onBack={close}
          video={video}
          castUrl={
            castEpisode !== null && credentials !== null
              ? buildSeriesEpisodeUrl(credentials, castEpisode.id, castEpisode.containerExtension)
              : null
          }
          castTitle={castEpisode !== null ? `${title} · S${castEpisode.seasonNumber}E${castEpisode.episodeNumber}` : ''}
        />

        {playingEp !== null && src !== null ? (
          <div ref={playerRef} className="mb-6 scroll-mt-20 space-y-3">
            <PlaybackPlanPanel
              plan={playback.plan}
              src={src}
              subject="Cet épisode"
              container={playingEp.containerExtension}
              failed={playback.failed}
              vlcLabel={`Lire S${playingEp.seasonNumber}E${playingEp.episodeNumber} dans VLC`}
              vlcOnlyLabel={`Ouvrir S${playingEp.seasonNumber}E${playingEp.episodeNumber} dans VLC`}
              onRetryGateway={playback.retryGateway}
            >
              {(plan) => (
                <LandscapeStage video={video}>
                  <PlayerSlot
                    layout="live"
                    className="phone-land:h-full"
                    next={continuation}
                    errorActions={[
                      ...(followingEp !== null
                        ? [{ label: 'Épisode suivant', onSelect: () => playEpisode(followingEp, 0) }]
                        : []),
                      ...(showVlcButton ? [{ label: 'Ouvrir dans VLC', onSelect: () => launchVlc(src) }] : []),
                    ]}
                    onMinimize={close}
                    media={{
                      kind: 'episode',
                      ownerId: seriesId,
                      itemId: playingEp.id,
                      title: `S${playingEp.seasonNumber} E${playingEp.episodeNumber} · ${playingEp.title}`,
                      subtitle: series != null ? displayTitle(series.name) : null,
                      artwork: playingEp.imageUrl ?? posterUrl,
                    }}
                    src={src}
                    {...planSourceProps(plan, startAt, supportsNativeHls())}
                    onDirectMkvFailed={playback.markDirectMkvFailed}
                    contentType="episode"
                    container={playingEp.containerExtension}
                    duration={playingEp.durationSecs}
                    poster={playingEp.imageUrl ?? posterUrl}
                    onProgress={(pos, dur, force) =>
                      saveProgress(
                        {
                          type: 'episode',
                          itemId: playingEp.id,
                          seriesId,
                          positionSec: pos,
                          durationSec: dur,
                          label: episodeLabel(playingEp),
                          posterUrl,
                        },
                        { force },
                      )
                    }
                    onEnded={() => handleEnded(playingEp)}
                    onError={playback.markFailed}
                  />
                  {upNext !== null && (
                    <UpNextOverlay episode={upNext} onPlay={() => playEpisode(upNext, 0)} onCancel={() => setUpNext(null)} />
                  )}
                </LandscapeStage>
              )}
            </PlaybackPlanPanel>
            <div className="flex items-center gap-3">
              <p className="min-w-0 flex-1 truncate text-sm text-fg-muted">
                S{playingEp.seasonNumber} E{playingEp.episodeNumber} · {playingEp.title}
              </p>
              {followingEp !== null && (
                <Button size="sm" variant="secondary" onClick={() => playEpisode(followingEp, 0)}>
                  <IconSkipNext className="h-4 w-4" />
                  Épisode suivant
                </Button>
              )}
            </div>
          </div>
        ) : (
          series !== undefined && (
            <div className="mb-6 flex animate-fade-in gap-5">
              <PosterImage
                src={posterUrl}
                fallbackSrc={tmdbPosterUrl}
                alt={series.name}
                className="hidden aspect-[2/3] w-36 shrink-0 rounded-2xl sm:block"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-fg-muted">
                  {badge !== null && (
                    <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold uppercase text-fg">{badge}</span>
                  )}
                  <span>
                    {[
                      year !== null ? String(year) : null,
                      rating !== null ? `★ ${rating.toFixed(1)}` : null,
                      details != null && details.seasons.length > 0
                        ? `${details.seasons.length} saison${details.seasons.length > 1 ? 's' : ''}`
                        : null,
                      genres,
                    ]
                      .filter((v): v is string => v !== null)
                      .join(' · ')}
                  </span>
                </div>
                {/* Meme ordre que la fiche film : version, action, puis synopsis. */}
                {variants.length >= 2 && (
                  <div className="mt-4">
                    <LanguageVariantSwitcher
                      variants={variants}
                      activeId={seriesId}
                      onSelect={(v) => router.replace(seriesHref(v.id))}
                    />
                  </div>
                )}
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  {primary !== null && (
                    <Button size="lg" onClick={() => playEpisode(primary.episode, primary.startAt)}>
                      <IconPlay className="h-5 w-5" />
                      {primary.label}
                    </Button>
                  )}
                  {trailerKey !== null && <TrailerButton videoId={trailerKey} />}
                </div>
                {overview !== null && <ClampedText text={overview} className="mt-3" />}
                {tmdb !== null && tmdb.cast.length > 0 && (
                  <p className="mt-2 text-xs text-fg-faint">
                    <span className="text-fg-muted">Avec </span>
                    {tmdb.cast.slice(0, 5).map((c) => c.name).join(', ')}
                  </p>
                )}
              </div>
            </div>
          )
        )}

        {details === undefined && (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-24 rounded-2xl" />
            ))}
          </div>
        )}
        {details === null && (
          <ErrorState
            title="Épisodes indisponibles"
            hint="Impossible de charger les saisons depuis le serveur."
            onRetry={retryDetails}
          />
        )}

        {details !== null && details !== undefined && (
          <SeasonEpisodes
            seasons={details.seasons}
            season={season}
            episodes={episodes}
            progress={epProgress}
            playingId={playingEp?.id ?? null}
            fallbackImage={series?.backdropUrl ?? posterUrl}
            onSelectSeason={setSeason}
            onPlay={(ep) => playEpisode(ep)}
            onToggleWatched={(list, watched) => void toggleWatched(list, watched)}
          />
        )}

        <TitleRail title="Titres similaires" series={similar} />
      </div>
    </div>
  );
}
