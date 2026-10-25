'use client';

import Link from 'next/link';
import { useCallback } from 'react';
import { Billboard, BillboardPlaceholder } from '@/components/home/Billboard';
import { ContinueCard } from '@/components/home/ContinueCard';
import { Top10Card } from '@/components/home/Top10Card';
import { FootballHeader } from '@/components/football/FootballHeader';
import { RecentChannelsStrip } from '@/components/live/RecentChannelsStrip';
import { ChannelLogo } from '@/components/shared/ChannelLogo';
import { EmptyState } from '@/components/shared/EmptyState';
import { MediaCard } from '@/components/shared/MediaCard';
import { Rail } from '@/components/shared/Rail';
import { SyncCatalogButton } from '@/components/shared/SyncCatalogButton';
import { ZibLogo } from '@/components/shared/ZibLogo';
import { Button } from '@/components/ui/Button';
import { IconRefresh, IconSettings } from '@/components/ui/icons';
import { Skeleton } from '@/components/ui/Skeleton';
import { useCatalogSync } from '@/hooks/useCatalogSync';
import { useHomeFeed } from '@/hooks/useHomeFeed';
import { useNewEpisodes } from '@/hooks/useNewEpisodes';
import { setZapContext } from '@/services/live/liveZappingService';
import { tmdbPoster } from '@/services/tmdb/tmdbImage';
import type { TrendingItem } from '@/services/discovery/trendingService';
import { usePlaybackStore } from '@/stores/playbackStore';
import type { Movie, Series } from '@/types/models';
import { FAVORITES_HREF, LIVE_HREF, liveHref, movieHref, seriesHref, SETTINGS_HREF } from '@/utils/appRoutes';
import { displayChannelName, displayTitle, displayYear } from '@/utils/displayTitle';
import { variantBadge } from '@/utils/variantPreference';

/**
 * ACCUEIL facon Netflix (chantier P4) : billboard, Continuer a regarder (une
 * carte par serie, lecture directe), Ma liste, Top 10, tendances, nouveautes
 * en VF, « Parce que tu as regarde », rangees par genre, Live. Toutes les
 * donnees viennent de useHomeFeed (services/home/*) — aucune logique ici.
 */

const CARD = 'w-28 shrink-0 sm:w-32';

function MovieCard({ movie }: { movie: Movie }) {
  const year = displayYear(movie.name, movie.tmdbYear ?? movie.year);
  return (
    <MediaCard
      className={CARD}
      href={movieHref(movie.id)}
      title={displayTitle(movie.name)}
      posterUrl={movie.posterUrl}
      rating={movie.ratingSort > 0 ? movie.ratingSort : null}
      tag={variantBadge(movie.variant, movie.variantSource)}
      subtitle={year !== null ? String(year) : null}
    />
  );
}

function SeriesCard({ series }: { series: Series }) {
  const year = series.tmdbYear ?? series.year;
  return (
    <MediaCard
      className={CARD}
      href={seriesHref(series.id)}
      title={displayTitle(series.name)}
      posterUrl={series.posterUrl}
      rating={series.ratingSort > 0 ? series.ratingSort : null}
      tag={variantBadge(series.variant, series.variantSource)}
      subtitle={year !== null ? String(year) : null}
    />
  );
}

function TrendingCard({ item }: { item: TrendingItem }) {
  return (
    <MediaCard
      className={CARD}
      href={item.type === 'vod' ? movieHref(item.xtreamId) : seriesHref(item.xtreamId)}
      title={item.title}
      posterUrl={tmdbPoster(item.posterPath)}
      rating={item.rating}
      tag={variantBadge(item.variant, item.variantSource)}
      subtitle={item.year?.toString() ?? null}
    />
  );
}

function SeeAll({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="-my-2 -mr-2 px-2 py-3 text-xs text-fg-faint hover:text-fg">
      {label}
    </Link>
  );
}

function RailSkeleton() {
  return (
    <section className="mt-8">
      <Skeleton className="mb-3 h-4 w-40 rounded" />
      <div className="flex gap-3 overflow-hidden">
        {Array.from({ length: 7 }, (_, i) => (
          <Skeleton key={i} className="aspect-[2/3] w-28 shrink-0 rounded-xl sm:w-32" />
        ))}
      </div>
    </section>
  );
}

export default function HomePage() {
  const { hydrated: catalogHydrated } = useCatalogSync();
  const recentChannels = usePlaybackStore((s) => s.recentChannels);
  const dismissContinue = usePlaybackStore((s) => s.dismissContinue);
  const { hasCatalog, billboard, billboardPending, continueItems, myList, trending, discovery, discoveryLoading } = useHomeFeed();
  // Series suivies (commencees / favorites) avec des episodes apparus depuis.
  const newEpisodes = useNewEpisodes();

  const movieBecause = discovery.because.find((b) => b.type === 'vod');
  const seriesBecause = discovery.because.find((b) => b.type === 'series');
  const [firstGenres, moreGenres] = [discovery.movieGenres.slice(0, 2), discovery.movieGenres.slice(2)];
  const nothingYet =
    discoveryLoading && discovery.topMovies.length === 0 && discovery.newFrMovies.length === 0;
  // Catalogue present mais aucune rangee : erreur silencieuse -> on le dit.
  const emptyHome =
    billboard.length === 0 &&
    continueItems.length === 0 &&
    myList.length === 0 &&
    recentChannels.length === 0 &&
    discovery.topMovies.length === 0 &&
    discovery.newFrMovies.length === 0 &&
    discovery.topSeries.length === 0 &&
    discovery.newFrSeries.length === 0;
  // Zapping depuis les chaines recentes de l'accueil (comme dans la page Live).
  const onPlayRecent = useCallback(() => {
    setZapContext({
      label: 'Récemment regardées',
      entries: recentChannels.slice(0, 10).map((e) => ({ id: e.itemId, groupKey: null })),
    });
  }, [recentChannels]);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-6 pt-3 md:px-8 md:pt-6 xl:max-w-7xl 2xl:max-w-[1720px] 3xl:max-w-[2400px]">
      <h1 className="sr-only">Accueil</h1>
      <div className="mb-3 flex items-center justify-between md:hidden">
        <ZibLogo className="h-9 w-auto" />
        <Link
          href={SETTINGS_HREF}
          aria-label="Réglages"
          className="grid h-11 w-11 place-items-center rounded-full text-fg-muted transition-colors hover:bg-ink-800 hover:text-fg"
        >
          <IconSettings className="h-6 w-6" />
        </Link>
      </div>

      {catalogHydrated && !hasCatalog && (
        <div className="mt-8">
          <EmptyState
            title="Catalogue non synchronisé"
            hint="Récupère les chaînes, films et séries de ton serveur pour commencer."
            action={<SyncCatalogButton size="lg" />}
          />
        </div>
      )}

      {billboardPending ? (
        // Meme gabarit que le Billboard : il arrive ~0,5 s apres le reste et
        // poussait toute la page (taps rates).
        <BillboardPlaceholder />
      ) : (
        billboard.length > 0 && <Billboard items={billboard} />
      )}

      {continueItems.length > 0 && (
        <Rail title="Continuer à regarder">
          {continueItems.map((item) => (
            <ContinueCard key={item.key} item={item} onDismiss={() => void dismissContinue(item.dismiss)} />
          ))}
        </Rail>
      )}

      {newEpisodes.length > 0 && (
        <Rail title="Nouveaux épisodes">
          {newEpisodes.map(({ series, episodes }) => {
            const first = episodes[0]!;
            return (
              <MediaCard
                key={`new:${series.id}`}
                className={CARD}
                // Tap = lecture directe du premier nouvel episode.
                href={seriesHref(series.id, '', { play: true, episodeId: first.id })}
                title={displayTitle(series.name)}
                posterUrl={series.posterUrl}
                badge={episodes.length > 1 ? `+${episodes.length} épisodes` : 'Nouveau'}
                subtitle={`S${first.seasonNumber} E${first.episodeNumber}`}
                tag={variantBadge(series.variant, series.variantSource)}
              />
            );
          })}
        </Rail>
      )}

      {recentChannels.length > 0 && <RecentChannelsStrip onPlay={onPlayRecent} />}

      <FootballHeader />

      {myList.length > 0 && (
        <Rail title="Ma liste" action={<SeeAll href={FAVORITES_HREF} label="Tout voir" />}>
          {myList.map((entry) =>
            entry.type === 'vod' ? (
              <MediaCard
                key={`vod:${entry.item.id}`}
                className={CARD}
                href={movieHref(entry.item.id)}
                title={displayTitle(entry.item.name)}
                posterUrl={entry.item.posterUrl}
                tag={variantBadge(entry.item.variant, entry.item.variantSource)}
              />
            ) : (
              <MediaCard
                key={`series:${entry.item.id}`}
                className={CARD}
                href={seriesHref(entry.item.id)}
                title={displayTitle(entry.item.name)}
                posterUrl={entry.item.posterUrl}
                tag={variantBadge(entry.item.variant, entry.item.variantSource)}
              />
            ),
          )}
        </Rail>
      )}

      {nothingYet && hasCatalog && (
        <>
          <RailSkeleton />
          <RailSkeleton />
        </>
      )}

      {discovery.topMovies.length >= 5 && (
        <Rail title="Top 10 des films" action={<SeeAll href="/movies" label="Voir les films" />}>
          {discovery.topMovies.map((movie, i) => (
            <Top10Card
              key={movie.id}
              rank={i + 1}
              href={movieHref(movie.id)}
              title={displayTitle(movie.name)}
              posterUrl={movie.posterUrl}
              badge={variantBadge(movie.variant, movie.variantSource)}
            />
          ))}
        </Rail>
      )}

      {trending.movies.length > 0 && billboard.length === 0 && (
        <Rail title="Tendances de la semaine">
          {trending.movies.map((t) => (
            <TrendingCard key={t.xtreamId} item={t} />
          ))}
        </Rail>
      )}

      {discovery.newFrMovies.length > 0 && (
        <Rail title="Nouveautés en VF">
          {discovery.newFrMovies.map((movie) => (
            <MovieCard key={movie.id} movie={movie} />
          ))}
        </Rail>
      )}

      {movieBecause !== undefined && movieBecause.type === 'vod' && (
        <Rail title={`Parce que tu as regardé ${movieBecause.sourceTitle}`}>
          {movieBecause.items.map((movie) => (
            <MovieCard key={movie.id} movie={movie} />
          ))}
        </Rail>
      )}

      {firstGenres.map((rail) => (
        <Rail key={`g:vod:${rail.genreId}`} title={`Films · ${rail.title}`}>
          {rail.items.map((movie) => (
            <MovieCard key={movie.id} movie={movie} />
          ))}
        </Rail>
      ))}

      {discovery.topSeries.length >= 5 && (
        <Rail title="Top 10 des séries" action={<SeeAll href="/series" label="Voir les séries" />}>
          {discovery.topSeries.map((series, i) => (
            <Top10Card
              key={series.id}
              rank={i + 1}
              href={seriesHref(series.id)}
              title={displayTitle(series.name)}
              posterUrl={series.posterUrl}
              badge={variantBadge(series.variant, series.variantSource)}
            />
          ))}
        </Rail>
      )}

      {trending.series.length > 0 && (
        <Rail title="Séries tendance">
          {trending.series.map((t) => (
            <TrendingCard key={t.xtreamId} item={t} />
          ))}
        </Rail>
      )}

      {seriesBecause !== undefined && seriesBecause.type === 'series' && (
        <Rail title={`Parce que tu as regardé ${seriesBecause.sourceTitle}`}>
          {seriesBecause.items.map((series) => (
            <SeriesCard key={series.id} series={series} />
          ))}
        </Rail>
      )}

      {discovery.newFrSeries.length > 0 && (
        <Rail title="Séries en VF récemment mises à jour">
          {discovery.newFrSeries.map((series) => (
            <SeriesCard key={series.id} series={series} />
          ))}
        </Rail>
      )}

      {discovery.seriesGenres.map((rail) => (
        <Rail key={`g:series:${rail.genreId}`} title={`Séries · ${rail.title}`}>
          {rail.items.map((series) => (
            <SeriesCard key={series.id} series={series} />
          ))}
        </Rail>
      ))}

      {moreGenres.map((rail) => (
        <Rail key={`g:vod:${rail.genreId}`} title={`Films · ${rail.title}`}>
          {rail.items.map((movie) => (
            <MovieCard key={movie.id} movie={movie} />
          ))}
        </Rail>
      ))}

      {discovery.liveSports.length > 0 && (
        <Rail title="Sport en direct" action={<SeeAll href={LIVE_HREF} label="Tout le Live" />}>
          {discovery.liveSports.map((channel) => (
            <Link
              key={channel.id}
              href={liveHref(channel.id)}
              onClick={() =>
                setZapContext({
                  label: 'Sport en direct',
                  entries: discovery.liveSports.map((ch) => ({ id: ch.id, groupKey: null })),
                })
              }
              className="w-36 shrink-0 rounded-xl bg-ink-800 p-3 transition-colors hover:bg-ink-700"
            >
              <ChannelLogo channel={channel} className="mx-auto h-16 w-16" />
              <span className="mt-2 block truncate text-center text-xs text-fg">{displayChannelName(channel.name)}</span>
            </Link>
          ))}
        </Rail>
      )}

      {hasCatalog && !discoveryLoading && emptyHome && (
        <div className="mt-8">
          <EmptyState
            title="Rien à afficher pour le moment"
            hint="Les recommandations n'ont pas pu être chargées."
            action={
              <Button variant="secondary" onClick={() => window.location.reload()}>
                <IconRefresh className="h-4 w-4" />
                Réessayer
              </Button>
            }
          />
        </div>
      )}
    </main>
  );
}
