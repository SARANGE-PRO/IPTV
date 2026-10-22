'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EmptyState } from '@/components/shared/EmptyState';
import { FavoriteButton } from '@/components/shared/FavoriteButton';
import { HScroll } from '@/components/shared/HScroll';
import { LanguageVariantSwitcher } from '@/components/media/LanguageVariantSwitcher';
import { TitleRail } from '@/components/media/TitleRail';
import { TrailerButton } from '@/components/media/TrailerButton';
import { PosterImage } from '@/components/shared/PosterImage';
import { ExternalPlayer } from '@/components/player/ExternalPlayer';
import { DirectMkvProbe } from '@/components/player/DirectMkvProbe';
import { PlayerSlot } from '@/components/player/host/PlayerSlot';
import { EpisodeRow } from '@/components/series/EpisodeRow';
import { UpNextOverlay } from '@/components/series/UpNextOverlay';
import { Button } from '@/components/ui/Button';
import { IconArrowLeft, IconCheck, IconPlay, IconSkipNext } from '@/components/ui/icons';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';
import * as catalogRepository from '@/services/data/catalogService';
import * as playbackRepository from '@/services/data/playbackDataService';
import { nextEpisode, primaryAction, resumePosition, watchedRatio } from '@/services/media/episodeService';
import { resetGatewayHealthCache } from '@/services/player/mediaGatewayService';
import { findSeriesVariants, type LanguageVariant } from '@/services/media/languageVariantService';
import { getSeriesDetailsCached } from '@/services/xtream/seriesDetailsService';
import { tmdbBackdrop, tmdbPoster } from '@/services/tmdb/tmdbImage';
import { secureImageSrc } from '@/utils/secureUrl';
import { buildSeriesEpisodeUrl } from '@/services/xtream/xtreamUrls';
import { supportsNativeHls } from '@/utils/playerSupport';
import { usePlaybackPlan } from '@/hooks/usePlaybackPlan';
import { useTmdbMetadata } from '@/hooks/useTmdbMetadata';
import { useSimilarSeries } from '@/hooks/useTitleExtras';
import { useMediaSession } from '@/hooks/useMediaSession';
import { useAuthStore } from '@/stores/authStore';
import { usePlaybackStore } from '@/stores/playbackStore';
import { useUiSettingsStore } from '@/stores/uiSettingsStore';
import type { Episode, PlaybackEntry, Series, SeriesDetails } from '@/types/models';
import { displayTitle } from '@/utils/displayTitle';
import { seriesHref } from '@/utils/appRoutes';
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
  const preferredLanguage = useUiSettingsStore((s) => s.preferredLanguage);
  const router = useRouter();

  const [series, setSeries] = useState<Series | null | undefined>(undefined);
  const [variants, setVariants] = useState<LanguageVariant[]>([]);
  const [details, setDetails] = useState<SeriesDetails | null | undefined>(undefined);
  const [season, setSeason] = useState<number | null>(null);
  const [playingEp, setPlayingEp] = useState<Episode | null>(null);
  const [startAt, setStartAt] = useState(0);
  const [failed, setFailed] = useState(false);
  // Incremente -> re-sonde la passerelle (echec de lecture ou reveil du PC).
  const [planRetry, setPlanRetry] = useState(0);
  const [epProgress, setEpProgress] = useState<Map<string, PlaybackEntry>>(new Map());
  const [progressLoaded, setProgressLoaded] = useState(false);
  const [upNext, setUpNext] = useState<Episode | null>(null);
  const [detailsRetry, setDetailsRetry] = useState(0);

  useEffect(() => {
    let active = true;
    void catalogRepository.getSeriesById(seriesId).then((s) => {
      if (active) setSeries(s ?? null);
    });
    return () => {
      active = false;
    };
  }, [seriesId]);

  // Variantes de langue (series soeurs VF/VOSTFR/MULTI/VO) : changer de version
  // = recharger la serie soeur via sa route (fonctionne en modal comme en page).
  useEffect(() => {
    if (series === null || series === undefined) return;
    let active = true;
    void findSeriesVariants(series, preferredLanguage).then((vs) => {
      if (active) setVariants(vs);
    });
    return () => {
      active = false;
    };
  }, [series, preferredLanguage]);

  // Saisons/episodes charges A LA DEMANDE (cache Dexie + TTL).
  useEffect(() => {
    if (credentials === null) return;
    let active = true;
    setDetails(undefined);
    void getSeriesDetailsCached(credentials, seriesId, { force: detailsRetry > 0 })
      .then((d) => {
        if (active) setDetails(d);
      })
      .catch(() => {
        if (active) setDetails(null);
      });
    return () => {
      active = false;
    };
  }, [credentials, seriesId, detailsRetry]);

  const refreshProgress = useCallback(async () => {
    setEpProgress(await playbackRepository.getSeriesEpisodeProgress(seriesId));
    setProgressLoaded(true);
  }, [seriesId]);

  useEffect(() => {
    void refreshProgress();
  }, [refreshProgress, playingEp]);

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

  const playEpisode = useCallback(
    (ep: Episode, from?: number) => {
      setUpNext(null);
      setStartAt(from ?? resumePosition(epProgress.get(ep.id)));
      setFailed(false);
      setSeason(ep.seasonNumber);
      setPlayingEp(ep);
    },
    [epProgress],
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

  const handleEnded = (ep: Episode) => {
    void markFinished('episode', ep.id);
    const next = nextEpisode(allEpisodes, ep.id);
    if (next !== null) setUpNext(next);
  };

  const episodeLabel = (ep: Episode): string =>
    `${series?.name ?? 'Série'} · S${ep.seasonNumber}E${ep.episodeNumber}`;

  const toggleWatched = async (list: Episode[], watched: boolean) => {
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

  const seasonWatched = episodes.length > 0 && episodes.every((ep) => epProgress.get(ep.id)?.finished === 1);

  const src =
    playingEp !== null && credentials !== null
      ? buildSeriesEpisodeUrl(credentials, playingEp.id, playingEp.containerExtension)
      : null;

  // Plan de lecture adaptatif selon le conteneur de l'episode courant.
  // Echec du remux MKV direct (codecs/CORS/MSE) : on retombe sur passerelle/VLC.
  const [directMkvFailed, setDirectMkvFailed] = useState(false);
  const plan = usePlaybackPlan(playingEp?.containerExtension ?? null, planRetry, { directMkvAllowed: !directMkvFailed });

  if (series === null) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-6 md:px-8">
        <EmptyState title="Série introuvable" hint="Elle a peut-être disparu du catalogue." />
      </div>
    );
  }

  const heroBackdrop = secureImageSrc(tmdbBackdrop(tmdb?.backdropPath ?? null) ?? series?.backdropUrl ?? null);
  const inPlayer = playingEp !== null && src !== null;
  const badge = series != null ? variantBadge(series.variant, series.variantSource) : null;
  const year = series?.tmdbYear ?? series?.year ?? null;

  return (
    <div className="mx-auto w-full max-w-4xl">
      {!inPlayer && (
        <div className="relative h-48 w-full overflow-hidden sm:h-72 sm:rounded-t-3xl">
          {heroBackdrop !== null ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={heroBackdrop} alt="" aria-hidden className="h-full w-full animate-fade-in object-cover object-top" />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-ink-800 to-ink-950" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/60 to-ink-950/10" />
          <div className="absolute inset-0 bg-gradient-to-r from-ink-950/70 to-transparent" />
        </div>
      )}

      <div className={cn('px-4 pb-8 md:px-8', inPlayer ? 'pt-6' : 'relative -mt-16 sm:-mt-24')}>
        <div className="mb-4 flex items-center gap-3">
          <button
            onClick={() => (onBack !== undefined ? onBack() : router.back())}
            aria-label="Retour"
            className="glass rounded-full p-2 text-fg-muted transition-colors hover:text-fg"
          >
            <IconArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="min-w-0 flex-1 truncate text-lg font-semibold text-fg drop-shadow">
            {series != null ? displayTitle(series.name) : ''}
          </h1>
          <FavoriteButton type="series" itemId={seriesId} />
        </div>

        {playingEp !== null && src !== null ? (
          <div className="mb-6 space-y-3">
            {plan === 'vlc-only' ? (
              <div className="rounded-2xl bg-ink-800 p-6 text-center">
                <p className="text-sm text-fg">
                  Cet épisode est en {playingEp.containerExtension?.toUpperCase() ?? 'un format non lisible'} — un
                  iPhone ou iPad ne le décode pas dans le navigateur.
                </p>
                <p className="mt-1.5 text-xs text-fg-muted">
                  Allume la passerelle pour le lire ici, ou ouvre-le dans VLC (lecture native).
                </p>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                  <Button size="sm" variant="secondary" onClick={() => setPlanRetry((n) => n + 1)}>
                    Réessayer la passerelle
                  </Button>
                  <ExternalPlayer
                    streamUrl={src}
                    label={`Ouvrir S${playingEp.seasonNumber}E${playingEp.episodeNumber} dans VLC`}
                  />
                </div>
                <DirectMkvProbe streamUrl={src} />
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
                <div className="relative">
                  <PlayerSlot
                    media={{
                      kind: 'episode',
                      ownerId: seriesId,
                      itemId: playingEp.id,
                      title: `S${playingEp.seasonNumber} E${playingEp.episodeNumber} · ${playingEp.title}`,
                      subtitle: series != null ? displayTitle(series.name) : null,
                      artwork: playingEp.imageUrl ?? posterUrl,
                    }}
                    src={src}
                    transcode={plan === 'gateway'}
                    directMkv={plan === 'direct-mkv'}
                    onDirectMkvFailed={() => setDirectMkvFailed(true)}
                    preferHls={plan === 'gateway' && supportsNativeHls()}
                    contentType="episode"
                    container={playingEp.containerExtension}
                    startAt={plan === 'gateway' && supportsNativeHls() ? 0 : startAt}
                    startOffset={plan === 'gateway' && supportsNativeHls() ? startAt : 0}
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
                    onError={() => {
                      setFailed(true);
                      resetGatewayHealthCache(); // re-sonde possible au prochain essai, sans boucler
                    }}
                  />
                  {upNext !== null && (
                    <UpNextOverlay
                      episode={upNext}
                      onPlay={() => playEpisode(upNext, 0)}
                      onCancel={() => setUpNext(null)}
                    />
                  )}
                </div>
              </>
            )}
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
                {overview !== null && (
                  <p className="mt-2 line-clamp-4 text-sm leading-relaxed text-fg-muted">{overview}</p>
                )}
                {tmdb !== null && tmdb.cast.length > 0 && (
                  <p className="mt-2 text-xs text-fg-faint">
                    <span className="text-fg-muted">Avec </span>
                    {tmdb.cast.slice(0, 5).map((c) => c.name).join(', ')}
                  </p>
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
                {variants.length >= 2 && (
                  <div className="mt-4">
                    <LanguageVariantSwitcher
                      variants={variants}
                      activeId={seriesId}
                      onSelect={(v) => router.replace(seriesHref(v.id))}
                    />
                  </div>
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
          <EmptyState
            title="Épisodes indisponibles"
            hint="Impossible de charger les saisons depuis le serveur."
            action={
              <Button size="sm" variant="secondary" onClick={() => setDetailsRetry((n) => n + 1)}>
                Réessayer
              </Button>
            }
          />
        )}

        {details !== null && details !== undefined && (
          <>
            <div className="mb-3 flex items-center gap-2">
              <HScroll className="flex min-w-0 flex-1 gap-2 pb-1 [scrollbar-width:none]">
                {details.seasons.map((s) => (
                  <button
                    key={s.seasonNumber}
                    onClick={() => setSeason(s.seasonNumber)}
                    className={cn(
                      'shrink-0 rounded-full px-4 py-1.5 text-xs font-medium transition-colors',
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
                  onClick={() => void toggleWatched(episodes, !seasonWatched)}
                  className="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium text-fg-faint transition-colors hover:bg-ink-800 hover:text-fg"
                >
                  <IconCheck className="h-3.5 w-3.5" />
                  {seasonWatched ? 'Saison non vue' : 'Saison vue'}
                </button>
              )}
            </div>

            <div className="flex flex-col gap-1">
              {episodes.map((ep) => {
                const prog = epProgress.get(ep.id);
                return (
                  <EpisodeRow
                    key={ep.id}
                    episode={ep}
                    fallbackImage={series?.backdropUrl ?? posterUrl}
                    ratio={watchedRatio(prog, ep.durationSecs)}
                    watched={prog?.finished === 1}
                    playing={playingEp?.id === ep.id}
                    onPlay={() => playEpisode(ep)}
                    onToggleWatched={() => void toggleWatched([ep], prog?.finished !== 1)}
                  />
                );
              })}
              {episodes.length === 0 && <EmptyState title="Aucun épisode dans cette saison" />}
            </div>
          </>
        )}

        <TitleRail title="Titres similaires" series={similar} />
      </div>
    </div>
  );
}
