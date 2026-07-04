'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { EmptyState } from '@/components/shared/EmptyState';
import { FavoriteButton } from '@/components/shared/FavoriteButton';
import { LanguageVariantSwitcher } from '@/components/media/LanguageVariantSwitcher';
import { PosterImage } from '@/components/shared/PosterImage';
import { ExternalPlayer } from '@/components/player/ExternalPlayer';
import { VideoPlayer } from '@/components/player/VideoPlayer';
import { Button } from '@/components/ui/Button';
import { IconArrowLeft, IconPlay } from '@/components/ui/icons';
import { cn } from '@/lib/cn';
import { mediaBadges, BADGE_TONE_CLASS } from '@/utils/mediaBadges';
import { secureImageSrc } from '@/utils/secureUrl';
import * as catalogRepository from '@/services/data/catalogService';
import * as playbackRepository from '@/services/data/playbackDataService';
import { resetGatewayHealthCache } from '@/services/player/mediaGatewayService';
import { resolveDuration, parseDurationToSeconds } from '@/services/player/mediaDurationService';
import { progressRatio, shouldOfferResume } from '@/services/player/resumePlaybackService';
import {
  findMovieVariants,
  pickPreferredVariant,
  type LanguageVariant,
} from '@/services/media/languageVariantService';
import { tmdbBackdrop, tmdbPoster } from '@/services/tmdb/tmdbImage';
import * as xtreamApi from '@/services/xtream/xtreamApi';
import { buildVodStreamUrl } from '@/services/xtream/xtreamUrls';
import { supportsNativeHls } from '@/utils/playerSupport';
import { usePlaybackPlan } from '@/hooks/usePlaybackPlan';
import { useTmdbMetadata } from '@/hooks/useTmdbMetadata';
import { useAuthStore } from '@/stores/authStore';
import { usePlaybackStore } from '@/stores/playbackStore';
import { useUiSettingsStore } from '@/stores/uiSettingsStore';
import type { Movie, PlaybackEntry } from '@/types/models';
import { displayTitle, displayYear } from '@/utils/displayTitle';
import { formatClock } from '@/utils/format';

/**
 * Contenu detail d'un film — reutilise par la PAGE plein ecran (movies/[vodId])
 * ET par le MODAL (intercepting route @modal/(.)movies/[vodId]). L'identifiant
 * arrive en prop (les deux routes le fournissent via useParams).
 */
export function MovieDetailView({ vodId }: { vodId: string }) {
  const credentials = useAuthStore((s) => s.credentials);
  const saveProgress = usePlaybackStore((s) => s.saveProgress);
  const markFinished = usePlaybackStore((s) => s.markFinished);
  const showVlcButton = useUiSettingsStore((s) => s.showVlcButton);
  const preferredLanguage = useUiSettingsStore((s) => s.preferredLanguage);
  const router = useRouter();

  const [movie, setMovie] = useState<Movie | null | undefined>(undefined);
  const [variants, setVariants] = useState<LanguageVariant[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [progress, setProgress] = useState<PlaybackEntry | null>(null);
  const [plot, setPlot] = useState<string | null>(null);
  const [xtreamPoster, setXtreamPoster] = useState<string | null>(null);
  const [xtreamBackdrop, setXtreamBackdrop] = useState<string | null>(null);
  const [xtreamDurationSecs, setXtreamDurationSecs] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [startAt, setStartAt] = useState(0);
  const [failed, setFailed] = useState(false);
  // Incremente -> re-sonde la passerelle (echec de lecture ou reveil du PC).
  const [planRetry, setPlanRetry] = useState(0);

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

  // Variantes de langue (VF/VOSTFR/MULTI/VO) : le provider duplique les entrees
  // par langue -> on regroupe les soeurs et on selectionne la langue preferee.
  useEffect(() => {
    if (movie === null || movie === undefined) return;
    let active = true;
    void findMovieVariants(movie).then((vs) => {
      if (!active) return;
      setVariants(vs);
      setActiveId(pickPreferredVariant(vs, movie.id, preferredLanguage)?.id ?? movie.id);
    });
    return () => {
      active = false;
    };
  }, [movie, preferredLanguage]);

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
  // STABILITE carte<->fiche : l'AFFICHE et la NOTE viennent d'Xtream (comme la
  // carte et le rail « Continuer ») -> jamais de conflit ni de mauvais match TMDB
  // sur l'identite. TMDB n'ENRICHIT que synopsis/casting/genres/backdrop.
  const posterUrl = movie?.posterUrl ?? xtreamPoster ?? tmdbPosterUrl;
  const backdropUrl = tmdbBackdrop(tmdb?.backdropPath ?? null) ?? xtreamBackdrop;
  const overview = tmdb?.overview ?? plot;
  const rating = movie?.rating ?? null;

  // Entree active = variante de langue selectionnee (a defaut, le film ouvert).
  const activeEntry = useMemo(
    () => variants.find((v) => v.id === activeId) ?? null,
    [variants, activeId],
  );
  const activeMovieId = activeEntry?.id ?? movie?.id ?? null;
  const activeContainer = activeEntry?.containerExtension ?? movie?.containerExtension ?? null;

  const src = useMemo(
    () =>
      credentials !== null && activeMovieId !== null
        ? buildVodStreamUrl(credentials, activeMovieId, activeContainer)
        : null,
    [credentials, activeMovieId, activeContainer],
  );

  // Plan de lecture adaptatif : MP4 -> direct ; MKV -> passerelle si joignable,
  // sinon VLC. Sonde la passerelle une seule fois (cache), aucune connexion Xtream.
  const plan = usePlaybackPlan(activeContainer, planRetry);

  // Changer de variante : on stoppe la lecture (le lecteur envoie son beacon
  // d'arret -> libere la connexion Xtream) ; l'utilisateur relance en un tap.
  const handleSelectVariant = (v: LanguageVariant) => {
    if (v.id === activeId) return;
    setActiveId(v.id);
    setPlaying(false);
    setFailed(false);
    setStartAt(0);
  };

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
      <div className="mx-auto w-full max-w-4xl px-4 py-6 md:px-8">
        <EmptyState title="Film introuvable" hint="Il a peut-être disparu du catalogue." />
      </div>
    );
  }

  const heroBackdrop = secureImageSrc(backdropUrl);
  const badges = mediaBadges(movie?.name ?? null, movie?.containerExtension ?? null);

  return (
    <div className="mx-auto w-full max-w-4xl">
      {/* Hero cinematographique : backdrop plein cadre + degrades de fondu. */}
      {!playing && (
        <div className="relative h-48 w-full overflow-hidden sm:h-72 sm:rounded-t-3xl">
          {heroBackdrop !== null ? (
            <img
              src={heroBackdrop}
              alt=""
              aria-hidden
              className="h-full w-full animate-fade-in object-cover object-top"
            />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-ink-800 to-ink-950" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/60 to-ink-950/10" />
          <div className="absolute inset-0 bg-gradient-to-r from-ink-950/70 to-transparent" />
        </div>
      )}

      <div className={cn('px-4 pb-8 md:px-8', playing ? 'pt-6' : 'relative -mt-16 sm:-mt-24')}>
        <div className="mb-4 flex items-center gap-3">
          <button
            onClick={() => router.back()}
            aria-label="Retour"
            className="glass rounded-full p-2 text-fg-muted transition-colors hover:text-fg"
          >
            <IconArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="min-w-0 flex-1 truncate text-lg font-semibold text-fg drop-shadow">
            {movie != null ? displayTitle(movie.name) : ''}
          </h1>
          <FavoriteButton type="vod" itemId={vodId} />
        </div>

        {playing && src !== null && movie !== undefined ? (
        <div className="space-y-3">
          {plan === 'vlc-only' ? (
            <div className="rounded-2xl bg-ink-800 p-6 text-center">
              <p className="text-sm text-fg">
                Ce film est en {activeContainer?.toUpperCase() ?? 'un format non lisible'} — un iPhone
                ou iPad ne le décode pas dans le navigateur.
              </p>
              <p className="mt-1.5 text-xs text-fg-muted">
                Allume la passerelle pour le lire ici, ou ouvre-le dans VLC (lecture native).
              </p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                <Button size="sm" variant="secondary" onClick={() => setPlanRetry((n) => n + 1)}>
                  Réessayer la passerelle
                </Button>
                <ExternalPlayer streamUrl={src} label="Ouvrir dans VLC" />
              </div>
            </div>
          ) : plan === 'checking' ? (
            <div className="flex aspect-video items-center justify-center rounded-2xl bg-black">
              <span className="h-8 w-8 animate-spin rounded-full border-2 border-ink-500 border-t-accent" />
            </div>
          ) : (
            <>
              <VideoPlayer
                src={src}
                transcode={plan === 'gateway'}
                preferHls={plan === 'gateway' && supportsNativeHls()}
                contentType="vod"
                container={movie.containerExtension}
                startAt={plan === 'gateway' && supportsNativeHls() ? 0 : startAt}
                startOffset={plan === 'gateway' && supportsNativeHls() ? startAt : 0}
                duration={fallbackDuration}
                poster={backdropUrl ?? posterUrl}
                onProgress={(pos, dur, force) =>
                  saveProgress(
                    {
                      type: 'vod',
                      itemId: vodId,
                      positionSec: pos,
                      durationSec: dur,
                      label: movie.name,
                      posterUrl,
                    },
                    { force },
                  )
                }
                onEnded={() => void markFinished('vod', vodId)}
                onError={() => {
                  setFailed(true);
                  // Invalide le cache sante : une eventuelle passerelle morte sera
                  // re-sondee au prochain essai (bouton, replay), sans boucler ici.
                  resetGatewayHealthCache();
                }}
              />
              {(showVlcButton || failed) && (
                <ExternalPlayer
                  streamUrl={src}
                  label={failed ? 'Ça ne marche pas ici ? Ouvrir dans VLC' : 'Lire dans VLC'}
                />
              )}
            </>
          )}
        </div>
      ) : (
        movie !== undefined && (
          <div className="flex animate-fade-in flex-col gap-6 sm:flex-row">
            <div className="w-40 shrink-0 sm:w-52">
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
              <div className="flex flex-wrap items-center gap-1.5">
                {(() => {
                  const year =
                    movie.year !== null
                      ? String(movie.year)
                      : (tmdb?.releaseDate?.slice(0, 4) ?? displayYear(movie.name, null)?.toString() ?? null);
                  return year !== null ? (
                    <span className="rounded-md bg-ink-700 px-2 py-0.5 text-[11px] font-medium text-fg-muted">{year}</span>
                  ) : null;
                })()}
                {rating !== null && (
                  <span className="rounded-md bg-amber-400/15 px-2 py-0.5 text-[11px] font-semibold text-amber-300">
                    ★ {rating.toFixed(1)}
                  </span>
                )}
                {tmdb?.runtimeMinutes != null && (
                  <span className="rounded-md bg-ink-700 px-2 py-0.5 text-[11px] font-medium text-fg-muted">
                    {tmdb.runtimeMinutes} min
                  </span>
                )}
              </div>
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
                      className={cn(
                        'rounded-md border px-1.5 py-0.5 text-[10px] font-semibold tracking-wide',
                        BADGE_TONE_CLASS[b.tone],
                      )}
                    >
                      {b.label}
                    </span>
                  ))}
                </div>
              )}
              {overview !== null && <p className="mt-3 text-sm leading-relaxed text-fg-muted">{overview}</p>}
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
              {variants.length >= 2 && activeId !== null && (
                <div className="mt-4">
                  <LanguageVariantSwitcher
                    variants={variants}
                    activeId={activeId}
                    onSelect={handleSelectVariant}
                  />
                </div>
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
      </div>
    </div>
  );
}
