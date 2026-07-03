'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { EmptyState } from '@/components/shared/EmptyState';
import { FavoriteButton } from '@/components/shared/FavoriteButton';
import { MediaCard } from '@/components/shared/MediaCard';
import { PosterImage } from '@/components/shared/PosterImage';
import { cn } from '@/lib/cn';
import * as catalogRepository from '@/db/repositories/catalogRepository';
import { useFavoritesStore } from '@/stores/favoritesStore';
import type { LiveChannel, Movie, Series } from '@/types/models';

type Tab = 'live' | 'vod' | 'series';

const TABS: { type: Tab; label: string }[] = [
  { type: 'live', label: 'Live' },
  { type: 'vod', label: 'Films' },
  { type: 'series', label: 'Séries' },
];

const byName = <T extends { name: string }>(items: T[]) =>
  [...items].sort((a, b) => a.name.localeCompare(b.name, 'fr'));

export default function FavoritesPage() {
  const [tab, setTab] = useState<Tab>('live');
  const ids = useFavoritesStore((s) => s.ids[tab]);
  const liveCount = useFavoritesStore((s) => s.ids.live.size);
  const vodCount = useFavoritesStore((s) => s.ids.vod.size);
  const seriesCount = useFavoritesStore((s) => s.ids.series.size);
  const counts: Record<Tab, number> = { live: liveCount, vod: vodCount, series: seriesCount };
  const [liveItems, setLiveItems] = useState<LiveChannel[]>([]);
  const [movieItems, setMovieItems] = useState<Movie[]>([]);
  const [seriesItems, setSeriesItems] = useState<Series[]>([]);

  useEffect(() => {
    let active = true;
    const list = [...ids];
    if (tab === 'live') {
      void catalogRepository.getLiveChannelsByIds(list).then((r) => {
        if (active) setLiveItems(byName(r));
      });
    } else if (tab === 'vod') {
      void catalogRepository.getMoviesByIds(list).then((r) => {
        if (active) setMovieItems(byName(r));
      });
    } else {
      void catalogRepository.getSeriesByIds(list).then((r) => {
        if (active) setSeriesItems(byName(r));
      });
    }
    return () => {
      active = false;
    };
  }, [tab, ids]);

  const isEmpty =
    (tab === 'live' && liveItems.length === 0) ||
    (tab === 'vod' && movieItems.length === 0) ||
    (tab === 'series' && seriesItems.length === 0);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6 md:px-8">
      <h1 className="text-2xl font-semibold tracking-tight text-fg">Favoris</h1>

      <div className="mt-4 flex gap-2">
        {TABS.map(({ type, label }) => (
          <button
            key={type}
            onClick={() => setTab(type)}
            className={cn(
              'rounded-full px-4 py-1.5 text-xs font-medium transition-colors',
              tab === type ? 'bg-accent text-white' : 'bg-ink-800 text-fg-muted hover:text-fg',
            )}
          >
            {label} ({counts[type]})
          </button>
        ))}
      </div>

      <div className="mt-6">
        {isEmpty ? (
          <EmptyState
            title="Aucun favori ici"
            hint="Ajoute des favoris avec le cœur sur les chaînes, films et séries."
          />
        ) : tab === 'live' ? (
          <div className="flex flex-col">
            {liveItems.map((c) => (
              <Link
                key={c.id}
                href={`/live/${c.id}`}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-ink-800"
              >
                <PosterImage src={c.logoUrl} alt={c.name} className="h-10 w-10 shrink-0 rounded-lg" />
                <span className="min-w-0 flex-1 truncate text-sm text-fg">{c.name}</span>
                <FavoriteButton type="live" itemId={c.id} />
              </Link>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
            {tab === 'vod'
              ? movieItems.map((m) => (
                  <MediaCard
                    key={m.id}
                    href={`/movies/${m.id}`}
                    title={m.name}
                    posterUrl={m.posterUrl}
                    subtitle={m.year !== null ? String(m.year) : null}
                    favorite={{ type: 'vod', itemId: m.id }}
                  />
                ))
              : seriesItems.map((s) => (
                  <MediaCard
                    key={s.id}
                    href={`/series/${s.id}`}
                    title={s.name}
                    posterUrl={s.posterUrl}
                    subtitle={s.releaseDate?.slice(0, 4) ?? null}
                    favorite={{ type: 'series', itemId: s.id }}
                  />
                ))}
          </div>
        )}
      </div>
    </main>
  );
}
