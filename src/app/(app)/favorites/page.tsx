'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { BrandMark } from '@/components/shared/BrandMark';
import { ChannelLogo } from '@/components/shared/ChannelLogo';
import { EmptyState } from '@/components/shared/EmptyState';
import { FavoriteButton } from '@/components/shared/FavoriteButton';
import { MediaCard } from '@/components/shared/MediaCard';
import { cn } from '@/lib/cn';
import * as catalogRepository from '@/services/data/catalogService';
import * as favoritesRepository from '@/services/data/favoritesDataService';
import { useFavoritesStore } from '@/stores/favoritesStore';
import type { LiveChannel, Movie, Series } from '@/types/models';
import { displayChannelName, displayTitle, displayYear } from '@/utils/displayTitle';

type Tab = 'live' | 'vod' | 'series';

const TABS: { type: Tab; label: string }[] = [
  { type: 'live', label: 'Live' },
  { type: 'vod', label: 'Films' },
  { type: 'series', label: 'Séries' },
];

type Sort = 'recent' | 'name';

const byName = <T extends { name: string }>(items: T[]) =>
  [...items].sort((a, b) => a.name.localeCompare(b.name, 'fr'));

export default function FavoritesPage() {
  const [tab, setTab] = useState<Tab>('live');
  const [sort, setSort] = useState<Sort>('recent');
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
    // Entrees triees par date d'ajout (recent -> ancien) : source de l'ordre
    // "Récent". getXByIds ne garantit pas l'ordre, on le reimpose via rank.
    void favoritesRepository.getFavoritesByType(tab).then(async (entries) => {
      const orderedIds = entries.map((e) => e.itemId);
      const rank = new Map(orderedIds.map((id, i) => [id, i] as const));
      const recent = <T extends { id: string }>(items: T[]): T[] =>
        [...items].sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
      if (tab === 'live') {
        const r = await catalogRepository.getLiveChannelsByIds(orderedIds);
        if (active) setLiveItems(recent(r));
      } else if (tab === 'vod') {
        const r = await catalogRepository.getMoviesByIds(orderedIds);
        if (active) setMovieItems(recent(r));
      } else {
        const r = await catalogRepository.getSeriesByIds(orderedIds);
        if (active) setSeriesItems(recent(r));
      }
    });
    return () => {
      active = false;
    };
  }, [tab, ids]);

  // Vide = aucun favori de ce type (source de verite : le Set du store),
  // pas "items pas encore chargés" — evite le flash d'ecran vide au switch d'onglet.
  const isEmpty = counts[tab] === 0;
  const ordered = <T extends { name: string }>(items: T[]): T[] => (sort === 'name' ? byName(items) : items);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6 md:px-8">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-fg">Favoris</h1>
        <BrandMark className="md:hidden" />
      </div>

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

      {!isEmpty && (
        <div className="mt-4 flex items-center gap-2 text-xs">
          <span className="text-fg-faint">Trier :</span>
          {(
            [
              { key: 'recent', label: 'Récent' },
              { key: 'name', label: 'A→Z' },
            ] as const
          ).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setSort(key)}
              className={cn(
                'rounded-full px-3 py-1 font-medium transition-colors',
                sort === key ? 'bg-ink-700 text-fg' : 'text-fg-muted hover:text-fg',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <div className="mt-6">
        {isEmpty ? (
          <EmptyState
            title="Aucun favori ici"
            hint="Ajoute des favoris avec le cœur sur les chaînes, films et séries."
          />
        ) : tab === 'live' ? (
          <div className="flex flex-col">
            {ordered(liveItems).map((c) => (
              <Link
                key={c.id}
                href={`/live/${c.id}`}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-ink-800"
              >
                <ChannelLogo channel={c} className="h-10 w-10 shrink-0" />
                <span className="min-w-0 flex-1 truncate text-sm text-fg">{displayChannelName(c.name)}</span>
                <FavoriteButton type="live" itemId={c.id} />
              </Link>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
            {tab === 'vod'
              ? ordered(movieItems).map((m) => (
                  <MediaCard
                    key={m.id}
                    href={`/movies/${m.id}`}
                    title={displayTitle(m.name)}
                    posterUrl={m.posterUrl}
                    subtitle={displayYear(m.name, m.year)?.toString() ?? null}
                    favorite={{ type: 'vod', itemId: m.id }}
                  />
                ))
              : ordered(seriesItems).map((s) => (
                  <MediaCard
                    key={s.id}
                    href={`/series/${s.id}`}
                    title={displayTitle(s.name)}
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
