'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DetailHeader } from '@/components/media/DetailHeader';
import { DetailHero } from '@/components/media/DetailHero';
import { LanguageVariantSwitcher } from '@/components/media/LanguageVariantSwitcher';
import { TitleRail } from '@/components/media/TitleRail';
import { TrailerButton } from '@/components/media/TrailerButton';
import { ExternalPlayer, launchVlc } from '@/components/player/ExternalPlayer';
import { PlayerSlot } from '@/components/player/host/PlayerSlot';
import { LandscapeStage } from '@/components/player/LandscapeStage';
import { PlaybackPlanPanel } from '@/components/player/PlaybackPlanPanel';
import { ClampedText } from '@/components/shared/ClampedText';
import { EmptyState } from '@/components/shared/EmptyState';
import { ErrorState } from '@/components/shared/ErrorState';
import { PosterImage } from '@/components/shared/PosterImage';
import { Button } from '@/components/ui/Button';
import { IconPlay } from '@/components/ui/icons';
import { Skeleton } from '@/components/ui/Skeleton';
import { useMediaSession } from '@/hooks/useMediaSession';
import { useMovieDetail } from '@/hooks/useMovieDetail';
import { useCollection, useSimilarMovies } from '@/hooks/useTitleExtras';
import { useTmdbMetadata } from '@/hooks/useTmdbMetadata';
import { useVodPlayback } from '@/hooks/useVodPlayback';
import { cn } from '@/lib/cn';
import type { LanguageVariant } from '@/services/media/languageVariantService';
import { resolveDuration } from '@/services/player/mediaDurationService';
import { planSourceProps } from '@/services/player/playbackPlanService';
import { progressRatio, shouldOfferResume } from '@/services/player/resumePlaybackService';
import { tmdbBackdrop, tmdbPoster } from '@/services/tmdb/tmdbImage';
import { buildVodStreamUrl } from '@/services/xtream/xtreamUrls';
import { useAuthStore } from '@/stores/authStore';
import { usePlaybackStore } from '@/stores/playbackStore';
import { usePlayerStore } from '@/stores/playerStore';
import { useUiSettingsStore } from '@/stores/uiSettingsStore';
import type { Movie } from '@/types/models';
import { displayTitle, displayYear } from '@/utils/displayTitle';
import { formatClock } from '@/utils/format';
import { BADGE_TONE_CLASS, mediaBadges } from '@/utils/mediaBadges';
import { supportsNativeHls } from '@/utils/playerSupport';

/** « 2019 · Film » : sous-titre lecteur / ecran verrouille. */
function movieSubtitle(movie: Movie): string {
  return [displayYear(movie.name, movie.tmdbYear ?? movie.year)?.toString() ?? null, 'Film']
    .filter((v): v is string => v !== null)
    .join(' · ');
}

/**
 * Contenu detail d'un film — rendu en MODAL par DetailModalHost (`?vod=<id>`,
 * voir utils/appRoutes). `onBack` : fermeture fournie par l'hote (depile
 * l'historique, ou retire le parametre en acces direct). Donnees : useMovieDetail ;
 * plan de lecture : useVodPlayback.
 */
export function MovieDetailView({
  vodId,
  onBack,
  autoPlay = false,
  resumeVariantId = null,
}: {
  vodId: string;
  onBack?: () => void;
  /** Lance la lecture des que la fiche est prete (reprise si progression). */
  autoPlay?: boolean;
  /** Version de langue qui joue deja (mini-lecteur) : la fiche rouverte la
   *  garde au lieu de basculer sur la langue preferee (pas de rechargement). */
  resumeVariantId?: string | null;
}) {
  const credentials = useAuthStore((s) => s.credentials);
  const saveProgress = usePlaybackStore((s) => s.saveProgress);
  const markFinished = usePlaybackStore((s) => s.markFinished);
  const showVlcButton = useUiSettingsStore((s) => s.showVlcButton);
  // <video> du lecteur unique, seulement quand c'est CE film qui joue ici.
  const video = usePlayerStore((s) =>
    s.session?.media.kind === 'vod' && s.session.media.ownerId === vodId ? s.video : null,
  );
  const router = useRouter();
  const close = useCallback(() => (onBack !== undefined ? onBack() : router.back()), [onBack, router]);

  const { movie, error, retry, progress, progressLoaded, variants, activeId, selectVariant, extras } = useMovieDetail(
    vodId,
    resumeVariantId,
  );
  const [playing, setPlaying] = useState(false);
  const [startAt, setStartAt] = useState(0);

  const tmdb = useTmdbMetadata('movie', movie?.name ?? null, movie?.year ?? null);
  const tmdbPosterUrl = tmdbPoster(tmdb?.posterPath ?? null);
  // STABILITE carte<->fiche : l'AFFICHE et la NOTE viennent d'Xtream (comme la
  // carte et le rail « Continuer ») -> jamais de conflit ni de mauvais match TMDB
  // sur l'identite. TMDB n'ENRICHIT que synopsis/casting/genres/backdrop.
  const posterUrl = movie?.posterUrl ?? extras.posterUrl ?? tmdbPosterUrl;
  const backdropUrl = tmdbBackdrop(tmdb?.backdropPath ?? null) ?? extras.backdropUrl;
  const overview = tmdb?.overview ?? extras.plot;
  const trailerKey = tmdb?.trailerKey ?? extras.trailerKey;
  const similar = useSimilarMovies(
    movie?.groupKey ?? null,
    movie != null && movie.tmdbGenreIds.length > 0 ? movie.tmdbGenreIds : (tmdb?.genreIds ?? []),
  );
  const collection = useCollection(tmdb?.collection?.id ?? null);

  // Ecran verrouille / Centre de controle (titre, annee, affiche) pendant la lecture.
  useMediaSession(
    playing && movie != null
      ? { title: displayTitle(movie.name), subtitle: movieSubtitle(movie), artwork: movie.posterUrl ?? tmdbPosterUrl }
      : null,
  );
  const rating = movie != null && movie.ratingSort > 0 ? movie.ratingSort : null;

  // Entree active = variante de langue selectionnee (a defaut, le film ouvert).
  const activeEntry = useMemo(() => variants.find((v) => v.id === activeId) ?? null, [variants, activeId]);
  const activeMovieId = activeEntry?.id ?? movie?.id ?? null;
  const activeContainer = activeEntry?.containerExtension ?? movie?.containerExtension ?? null;

  const src = useMemo(
    () => (credentials !== null && activeMovieId !== null ? buildVodStreamUrl(credentials, activeMovieId, activeContainer) : null),
    [credentials, activeMovieId, activeContainer],
  );

  // Plan de lecture adaptatif : MP4 -> direct ; MKV -> remux direct, passerelle
  // si joignable, sinon VLC. Sonde la passerelle une seule fois (cache).
  const playback = useVodPlayback(activeContainer);

  // Changer de variante : on stoppe la lecture (le lecteur envoie son beacon
  // d'arret -> libere la connexion Xtream) ; l'utilisateur relance en un tap.
  const handleSelectVariant = (v: LanguageVariant) => {
    if (v.id === activeId) return;
    selectVariant(v.id);
    setPlaying(false);
    playback.clearFailed();
    setStartAt(0);
  };

  // Duree de repli (Xtream puis TMDB) quand le player n'expose pas de duree fiable.
  const fallbackDuration = resolveDuration({
    xtreamSeconds: extras.durationSecs,
    tmdbSeconds: tmdb?.runtimeMinutes != null ? tmdb.runtimeMinutes * 60 : null,
  }).seconds;
  const effResumeDuration = progress?.durationSec ?? fallbackDuration;
  const canResume =
    progress !== null && progress.finished === 0 && shouldOfferResume(progress.positionSec, effResumeDuration);
  const ratio = progress !== null ? progressRatio(progress.positionSec, effResumeDuration) : null;
  const resumeFrom = canResume && progress !== null ? progress.positionSec : 0;

  const { clearFailed } = playback;
  const play = useCallback(
    (from: number) => {
      setStartAt(from);
      clearFailed();
      setPlaying(true);
    },
    [clearFailed],
  );

  // Lecture directe (« Lecture » du billboard, « Continuer a regarder ») : une
  // seule fois, quand film + version de langue + progression sont connus.
  const autoPlayedRef = useRef(false);
  useEffect(() => {
    if (!autoPlay || autoPlayedRef.current || movie == null) return;
    if (activeId === null || !progressLoaded) return;
    autoPlayedRef.current = true;
    play(resumeFrom);
  }, [autoPlay, movie, activeId, progressLoaded, resumeFrom, play]);

  if (error) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-6 md:px-8">
        <ErrorState title="Impossible d’ouvrir ce film" onRetry={retry} />
      </div>
    );
  }
  if (movie === null) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-6 md:px-8">
        <EmptyState title="Film introuvable" hint="Il a peut-être disparu du catalogue." />
      </div>
    );
  }

  const title = movie !== undefined ? displayTitle(movie.name) : '';
  const badges = mediaBadges(movie?.name ?? null, movie?.containerExtension ?? null);

  return (
    <div className="mx-auto w-full max-w-4xl">
      {!playing && <DetailHero backdropUrl={backdropUrl} />}

      <div className={cn('px-4 pb-8 md:px-8', playing ? 'pt-6' : 'relative -mt-16 sm:-mt-24')}>
        <DetailHeader type="vod" itemId={vodId} title={title} onBack={close} video={video} castUrl={src} castTitle={title} />

        {playing && src !== null && movie !== undefined ? (
          <div className="space-y-3">
            <PlaybackPlanPanel
              plan={playback.plan}
              src={src}
              subject="Ce film"
              container={activeContainer}
              failed={playback.failed}
              vlcLabel="Lire dans VLC"
              vlcOnlyLabel="Ouvrir dans VLC"
              onRetryGateway={playback.retryGateway}
            >
              {(plan) => (
                <LandscapeStage video={video}>
                  <PlayerSlot
                    layout="live"
                    className="phone-land:h-full"
                    errorActions={showVlcButton ? [{ label: 'Ouvrir dans VLC', onSelect: () => launchVlc(src) }] : []}
                    onMinimize={close}
                    media={{
                      kind: 'vod',
                      ownerId: vodId,
                      itemId: activeMovieId ?? vodId,
                      title,
                      subtitle: movieSubtitle(movie),
                      artwork: posterUrl,
                    }}
                    src={src}
                    {...planSourceProps(plan, startAt, supportsNativeHls())}
                    onDirectMkvFailed={playback.markDirectMkvFailed}
                    contentType="vod"
                    container={movie.containerExtension}
                    duration={fallbackDuration}
                    poster={backdropUrl ?? posterUrl}
                    onProgress={(pos, dur, force) =>
                      saveProgress(
                        { type: 'vod', itemId: vodId, positionSec: pos, durationSec: dur, label: movie.name, posterUrl },
                        { force },
                      )
                    }
                    onEnded={() => void markFinished('vod', vodId)}
                    onError={playback.markFailed}
                  />
                </LandscapeStage>
              )}
            </PlaybackPlanPanel>
          </div>
        ) : movie === undefined ? (
          // Chargement de la fiche : la silhouette de la page, pas un vide.
          <div className="flex flex-col gap-3" aria-hidden>
            <Skeleton className="h-5 w-40 rounded-md" />
            <Skeleton className="h-12 w-44 rounded-xl" />
            <Skeleton className="h-16 w-full rounded-xl" />
          </div>
        ) : (
          <div className="flex animate-fade-in flex-col gap-6 sm:flex-row">
            <div className="hidden w-52 shrink-0 sm:block">
              <div className="relative">
                <PosterImage
                  src={posterUrl}
                  fallbackSrc={tmdbPosterUrl}
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
              <MovieFacts movie={movie} releaseDate={tmdb?.releaseDate ?? null} rating={rating} runtime={tmdb?.runtimeMinutes ?? null} />
              {tmdb !== null && tmdb.genres.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {tmdb.genres.map((g) => (
                    <span key={g} className="rounded-full border border-ink-600 px-2 py-0.5 text-[11px] text-fg-muted">
                      {g}
                    </span>
                  ))}
                </div>
              )}
              {badges.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {badges.map((b) => (
                    <span
                      key={b.label}
                      className={cn('rounded-md border px-1.5 py-0.5 text-[10px] font-semibold tracking-wide', BADGE_TONE_CLASS[b.tone])}
                    >
                      {b.label}
                    </span>
                  ))}
                </div>
              )}
              {variants.length >= 2 && activeId !== null && (
                <div className="mt-4">
                  <LanguageVariantSwitcher variants={variants} activeId={activeId} onSelect={handleSelectVariant} />
                </div>
              )}
              <div className="mt-4 flex flex-wrap items-start gap-3">
                <Button size="lg" onClick={() => play(resumeFrom)}>
                  <IconPlay className="mr-2 h-4 w-4" />
                  {canResume && progress !== null ? `Reprendre (${formatClock(progress.positionSec)})` : 'Regarder'}
                </Button>
                {canResume && (
                  <Button size="lg" variant="secondary" onClick={() => play(0)}>
                    Recommencer
                  </Button>
                )}
                {trailerKey !== null && <TrailerButton videoId={trailerKey} />}
                {showVlcButton && src !== null && <ExternalPlayer streamUrl={src} label="Lire dans VLC" />}
              </div>
              {overview !== null && <ClampedText text={overview} className="mt-4" />}
              {tmdb !== null && tmdb.cast.length > 0 && (
                <div className="mt-3">
                  <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-fg-faint">Avec</p>
                  <div className="flex flex-wrap gap-1.5">
                    {tmdb.cast.slice(0, 6).map((c) => (
                      <span key={c.name} className="rounded-full bg-ink-800 px-2.5 py-1 text-[11px] text-fg-muted">
                        {c.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        {!playing && collection !== null && (
          <TitleRail title={collection.name} movies={collection.entries.map((e) => e.movie)} currentGroupKey={movie?.groupKey} />
        )}
        <TitleRail title="Titres similaires" movies={similar} />
      </div>
    </div>
  );
}

/** Annee · note · duree. */
function MovieFacts({
  movie,
  releaseDate,
  rating,
  runtime,
}: {
  movie: Movie;
  releaseDate: string | null;
  rating: number | null;
  runtime: number | null;
}) {
  const year =
    movie.year !== null ? String(movie.year) : (releaseDate?.slice(0, 4) ?? displayYear(movie.name, null)?.toString() ?? null);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {year !== null && <span className="rounded-md bg-ink-700 px-2 py-0.5 text-[11px] font-medium text-fg-muted">{year}</span>}
      {rating !== null && (
        <span className="rounded-md bg-amber-400/15 px-2 py-0.5 text-[11px] font-semibold text-amber-300">★ {rating.toFixed(1)}</span>
      )}
      {runtime !== null && (
        <span className="rounded-md bg-ink-700 px-2 py-0.5 text-[11px] font-medium text-fg-muted">{runtime} min</span>
      )}
    </div>
  );
}
