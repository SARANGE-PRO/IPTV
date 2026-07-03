'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { BrandLogo } from '@/components/shared/BrandLogo';
import { ChannelLogo } from '@/components/shared/ChannelLogo';
import { NextMatchBanner } from '@/components/live/NextMatchBanner';
import { EmptyState } from '@/components/shared/EmptyState';
import { MediaCard } from '@/components/shared/MediaCard';
import { PosterImage } from '@/components/shared/PosterImage';
import { Rail } from '@/components/shared/Rail';
import { Button } from '@/components/ui/Button';
import { IconFilm, IconHeart, IconRefresh, IconSearch, IconSeries, IconTv } from '@/components/ui/icons';
import { useAuthStore } from '@/stores/authStore';
import { useCatalogStore } from '@/stores/catalogStore';
import { useFavoritesStore } from '@/stores/favoritesStore';
import { useFilterStore } from '@/stores/filterStore';
import { usePlaybackStore } from '@/stores/playbackStore';
import * as catalogRepository from '@/db/repositories/catalogRepository';
import * as playbackRepository from '@/db/repositories/playbackRepository';
import { getMovieTop10 } from '@/services/ranking/smartRankingService';
import type { LiveChannel, Movie, PlaybackEntry, Series } from '@/types/models';
import { displayChannelName, displayTitle, displayYear } from '@/utils/displayTitle';
import { formatCount } from '@/utils/format';

function hrefForEntry(entry: PlaybackEntry): string {
  if (entry.type === 'episode') return `/series/${entry.seriesId ?? ''}`;
  if (entry.type === 'vod') return `/movies/${entry.itemId}`;
  return `/live/${entry.itemId}`;
}

const SECTION_CARDS = [
  { href: '/live', label: 'Live TV', icon: IconTv, key: 'live' as const, noun: 'chaînes' },
  { href: '/movies', label: 'Films', icon: IconFilm, key: 'vod' as const, noun: 'films' },
  { href: '/series', label: 'Séries', icon: IconSeries, key: 'series' as const, noun: 'séries' },
];

interface DiscoveryRails {
  topMovies: Movie[];
  frenchMovies: Movie[];
  popularMovies: Movie[];
  recentMovies: Movie[];
  resumeSeries: Series[];
  frenchSeries: Series[];
  topSeries: Series[];
  recentSeries: Series[];
  liveSports: LiveChannel[];
}

const EMPTY_RAILS: DiscoveryRails = {
  topMovies: [],
  frenchMovies: [],
  popularMovies: [],
  recentMovies: [],
  resumeSeries: [],
  frenchSeries: [],
  topSeries: [],
  recentSeries: [],
  liveSports: [],
};

/** Seuil de credibilite : sous ce nombre d'entrees, le Top 10 recommande est masque. */
const TOP10_MIN = 5;

export default function HomePage() {
  const credentials = useAuthStore((s) => s.credentials);
  const sections = useCatalogStore((s) => s.sections);
  const syncing = useCatalogStore((s) => s.syncing);
  const sync = useCatalogStore((s) => s.sync);
  const continueWatching = usePlaybackStore((s) => s.continueWatching);
  const recentChannels = usePlaybackStore((s) => s.recentChannels);
  const hydrateRails = usePlaybackStore((s) => s.hydrateRails);
  const liveFavs = useFavoritesStore((s) => s.ids.live.size);
  const vodFavs = useFavoritesStore((s) => s.ids.vod.size);
  const seriesFavs = useFavoritesStore((s) => s.ids.series.size);
  const hiddenLive = useFilterStore((s) => s.hidden.live);
  const hiddenVod = useFilterStore((s) => s.hidden.vod);
  const hiddenSeries = useFilterStore((s) => s.hidden.series);
  const [discovery, setDiscovery] = useState<DiscoveryRails>(EMPTY_RAILS);

  useEffect(() => {
    void hydrateRails();
  }, [hydrateRails]);

  const hasCatalog =
    sections.live.itemCount + sections.vod.itemCount + sections.series.itemCount > 0;
  const totalFavs = liveFavs + vodFavs + seriesFavs;

  useEffect(() => {
    if (!hasCatalog) {
      setDiscovery(EMPTY_RAILS);
      return;
    }
    let active = true;
    const loadResumeSeries = async (): Promise<Series[]> => {
      const ids = await playbackRepository.getInProgressSeriesIds(12);
      if (ids.length === 0) return [];
      const byId = new Map((await catalogRepository.getSeriesByIds(ids)).map((series) => [series.id, series]));
      return ids.map((id) => byId.get(id)).filter((series): series is Series => series !== undefined);
    };
    void Promise.all([
      getMovieTop10(10),
      catalogRepository.getFrenchMovies(18),
      catalogRepository.getRecentMovies(18),
      catalogRepository.getTopRatedMovies(18),
      loadResumeSeries(),
      catalogRepository.getFrenchSeries(18),
      catalogRepository.getRecentSeries(18),
      catalogRepository.getTopRatedSeries(18),
      catalogRepository.getLiveChannelsPage({ kind: 'frenchTheme', theme: 'sport' }, 0, 12),
    ]).then(
      ([
        topMovies,
        frenchMovies,
        recentMovies,
        popularMovies,
        resumeSeries,
        frenchSeries,
        recentSeries,
        topSeries,
        liveSports,
      ]) => {
        if (!active) return;
        const topIds = new Set(topMovies.map((movie) => movie.id));
        const recentIds = new Set(recentMovies.map((movie) => movie.id));
        const frenchMovieIds = new Set(frenchMovies.map((movie) => movie.id));
        const frenchSeriesIds = new Set(frenchSeries.map((series) => series.id));
        const recentSeriesIds = new Set(recentSeries.map((series) => series.id));
        setDiscovery({
          topMovies: topMovies.filter((movie) => !hiddenVod.has(movie.categoryId)),
          frenchMovies: frenchMovies
            .filter((movie) => !hiddenVod.has(movie.categoryId) && !topIds.has(movie.id) && !recentIds.has(movie.id))
            .slice(0, 12),
          popularMovies: popularMovies
            .filter(
              (movie) =>
                !hiddenVod.has(movie.categoryId) &&
                !topIds.has(movie.id) &&
                !recentIds.has(movie.id) &&
                !frenchMovieIds.has(movie.id),
            )
            .slice(0, 12),
          recentMovies: recentMovies.filter((movie) => !hiddenVod.has(movie.categoryId)),
          resumeSeries: resumeSeries.filter((series) => !hiddenSeries.has(series.categoryId)),
          frenchSeries: frenchSeries.filter((series) => !hiddenSeries.has(series.categoryId)),
          recentSeries: recentSeries.filter((series) => !hiddenSeries.has(series.categoryId)),
          topSeries: topSeries
            .filter(
              (series) =>
                !hiddenSeries.has(series.categoryId) &&
                !frenchSeriesIds.has(series.id) &&
                !recentSeriesIds.has(series.id),
            )
            .slice(0, 12),
          liveSports: liveSports.filter((channel) => !hiddenLive.has(channel.categoryId)),
        });
      },
    );
    return () => {
      active = false;
    };
  }, [
    hasCatalog,
    hiddenLive,
    hiddenVod,
    hiddenSeries,
    sections.live.itemCount,
    sections.vod.itemCount,
    sections.series.itemCount,
  ]);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8">
      <BrandLogo
        className="mb-6 md:hidden"
        markClassName="h-9 w-9"
        textClassName="text-xl"
      />
      <h1 className="pt-2 text-3xl font-semibold tracking-tight text-fg">Accueil</h1>

      <Link
        href="/search"
        className="mt-4 flex items-center gap-2.5 rounded-xl border border-ink-600 bg-ink-800 px-4 py-2.5 text-sm text-fg-faint transition-colors hover:border-ink-500 hover:text-fg-muted"
      >
        <IconSearch className="h-5 w-5" />
        Rechercher une chaîne, un film, une série…
      </Link>

      {hasCatalog && <NextMatchBanner credentials={credentials} />}

      {!hasCatalog && (
        <div className="mt-8">
          <EmptyState
            title="Catalogue non synchronisé"
            hint="Récupère les chaînes, films et séries de ton serveur pour commencer."
            action={
              <Button
                size="lg"
                onClick={() => {
                  if (credentials !== null) void sync(credentials, { force: true });
                }}
                disabled={syncing || credentials === null}
              >
                <IconRefresh className="mr-2 h-4 w-4" />
                {syncing ? 'Synchronisation…' : 'Synchroniser le catalogue'}
              </Button>
            }
          />
        </div>
      )}

      {continueWatching.length > 0 && (
        <Rail title="Continuer à regarder">
          {continueWatching.map((entry) => (
            <MediaCard
              key={`${entry.type}:${entry.itemId}`}
              className="w-32 shrink-0"
              href={hrefForEntry(entry)}
              title={entry.label ?? 'Sans titre'}
              posterUrl={entry.posterUrl}
              progress={
                entry.durationSec !== null && entry.durationSec > 0
                  ? entry.positionSec / entry.durationSec
                  : null
              }
            />
          ))}
        </Rail>
      )}

      {recentChannels.length > 0 && (
        <Rail title="Chaînes récentes">
          {recentChannels.map((entry) => (
            <Link
              key={entry.itemId}
              href={`/live/${entry.itemId}`}
              className="flex w-44 shrink-0 items-center gap-2.5 rounded-xl bg-ink-800 p-3 transition-colors hover:bg-ink-700"
            >
              <PosterImage
                src={entry.posterUrl}
                alt={entry.label ?? 'Chaîne'}
                className="h-9 w-9 shrink-0 rounded-lg"
              />
              <span className="min-w-0 truncate text-xs text-fg">{displayChannelName(entry.label ?? 'Chaîne')}</span>
            </Link>
          ))}
        </Rail>
      )}

      {discovery.topMovies.length >= TOP10_MIN && (
        <Rail title="Top 10 recommandé" action={<Link href="/movies" className="text-xs text-fg-faint hover:text-fg">Voir les films</Link>}>
          {discovery.topMovies.map((movie, index) => (
            <MediaCard
              key={movie.id}
              className="w-32 shrink-0"
              href={`/movies/${movie.id}`}
              title={displayTitle(movie.name)}
              posterUrl={movie.posterUrl}
              subtitle={movie.rating !== null ? `★ ${movie.rating.toFixed(1)}` : displayYear(movie.name, movie.year)?.toString()}
              badge={`#${index + 1}`}
            />
          ))}
        </Rail>
      )}

      {discovery.frenchMovies.length > 0 && (
        <Rail title="Films FR à découvrir">
          {discovery.frenchMovies.map((movie) => (
            <MediaCard key={movie.id} className="w-32 shrink-0" href={`/movies/${movie.id}`} title={displayTitle(movie.name)} posterUrl={movie.posterUrl} subtitle={displayYear(movie.name, movie.year)?.toString()} />
          ))}
        </Rail>
      )}

      {discovery.recentMovies.length > 0 && (
        <Rail title="Films récemment ajoutés">
          {discovery.recentMovies.map((movie) => (
            <MediaCard key={movie.id} className="w-32 shrink-0" href={`/movies/${movie.id}`} title={displayTitle(movie.name)} posterUrl={movie.posterUrl} subtitle={movie.rating !== null ? `★ ${movie.rating.toFixed(1)}` : null} />
          ))}
        </Rail>
      )}

      {discovery.popularMovies.length > 0 && (
        <Rail title="Films populaires" action={<Link href="/movies" className="text-xs text-fg-faint hover:text-fg">Voir les films</Link>}>
          {discovery.popularMovies.map((movie) => (
            <MediaCard key={movie.id} className="w-32 shrink-0" href={`/movies/${movie.id}`} title={displayTitle(movie.name)} posterUrl={movie.posterUrl} subtitle={movie.rating !== null ? `★ ${movie.rating.toFixed(1)}` : null} />
          ))}
        </Rail>
      )}

      {discovery.resumeSeries.length > 0 && (
        <Rail title="Séries à reprendre" action={<Link href="/series" className="text-xs text-fg-faint hover:text-fg">Voir les séries</Link>}>
          {discovery.resumeSeries.map((series) => (
            <MediaCard key={series.id} className="w-32 shrink-0" href={`/series/${series.id}`} title={displayTitle(series.name)} posterUrl={series.posterUrl} subtitle={series.releaseDate?.slice(0, 4)} />
          ))}
        </Rail>
      )}

      {discovery.frenchSeries.length > 0 && (
        <Rail title="Séries FR">
          {discovery.frenchSeries.map((series) => (
            <MediaCard key={series.id} className="w-32 shrink-0" href={`/series/${series.id}`} title={displayTitle(series.name)} posterUrl={series.posterUrl} subtitle={series.rating !== null ? `★ ${series.rating.toFixed(1)}` : series.releaseDate?.slice(0, 4)} />
          ))}
        </Rail>
      )}

      {discovery.recentSeries.length > 0 && (
        <Rail title="Séries récemment ajoutées">
          {discovery.recentSeries.map((series) => (
            <MediaCard key={series.id} className="w-32 shrink-0" href={`/series/${series.id}`} title={displayTitle(series.name)} posterUrl={series.posterUrl} subtitle={series.releaseDate?.slice(0, 4)} />
          ))}
        </Rail>
      )}

      {discovery.topSeries.length > 0 && (
        <Rail title="Séries mieux notées" action={<Link href="/series" className="text-xs text-fg-faint hover:text-fg">Voir les séries</Link>}>
          {discovery.topSeries.map((series) => (
            <MediaCard key={series.id} className="w-32 shrink-0" href={`/series/${series.id}`} title={displayTitle(series.name)} posterUrl={series.posterUrl} subtitle={series.rating !== null ? `★ ${series.rating.toFixed(1)}` : series.releaseDate?.slice(0, 4)} />
          ))}
        </Rail>
      )}

      {discovery.liveSports.length > 0 && (
        <Rail title="Sport en direct" action={<Link href="/live" className="text-xs text-fg-faint hover:text-fg">Tout le Live</Link>}>
          {discovery.liveSports.map((channel) => (
            <Link key={channel.id} href={`/live/${channel.id}`} className="w-36 shrink-0 rounded-xl bg-ink-800 p-3 transition-colors hover:bg-ink-700">
              <ChannelLogo channel={channel} className="mx-auto h-16 w-16" />
              <span className="mt-2 block truncate text-center text-xs text-fg">{displayChannelName(channel.name)}</span>
            </Link>
          ))}
        </Rail>
      )}

      {hasCatalog && (
        <section className="mt-8 grid gap-3 sm:grid-cols-3">
          {SECTION_CARDS.map(({ href, label, icon: Icon, key, noun }) => (
            <Link
              key={href}
              href={href}
              className="group rounded-2xl bg-ink-800 p-5 transition-colors hover:bg-ink-700"
            >
              <Icon className="h-6 w-6 text-accent" />
              <p className="mt-3 text-sm font-semibold text-fg">{label}</p>
              <p className="mt-1 text-xs text-fg-muted">
                {formatCount(sections[key].itemCount)} {noun} · {sections[key].categories.length}{' '}
                catégories
              </p>
            </Link>
          ))}
        </section>
      )}

      {totalFavs > 0 && (
        <Link
          href="/favorites"
          className="mt-4 flex items-center gap-3 rounded-2xl bg-ink-800 p-4 transition-colors hover:bg-ink-700"
        >
          <IconHeart className="h-5 w-5 text-accent" filled />
          <span className="text-sm text-fg">
            {totalFavs} favori{totalFavs > 1 ? 's' : ''}
          </span>
        </Link>
      )}

      {hasCatalog && (
        <div className="mt-8">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (credentials !== null) void sync(credentials, { force: true });
            }}
            disabled={syncing || credentials === null}
          >
            <IconRefresh className="mr-2 h-4 w-4" />
            {syncing ? 'Synchronisation…' : 'Resynchroniser'}
          </Button>
        </div>
      )}
    </main>
  );
}
