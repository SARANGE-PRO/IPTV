'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { EmptyState } from '@/components/shared/EmptyState';
import { MediaCard } from '@/components/shared/MediaCard';
import { PosterImage } from '@/components/shared/PosterImage';
import { Rail } from '@/components/shared/Rail';
import { Button } from '@/components/ui/Button';
import { IconFilm, IconHeart, IconRefresh, IconSeries, IconTv } from '@/components/ui/icons';
import { useAuthStore } from '@/stores/authStore';
import { useCatalogStore } from '@/stores/catalogStore';
import { useFavoritesStore } from '@/stores/favoritesStore';
import { usePlaybackStore } from '@/stores/playbackStore';
import type { PlaybackEntry } from '@/types/models';
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

  useEffect(() => {
    void hydrateRails();
  }, [hydrateRails]);

  const hasCatalog =
    sections.live.itemCount + sections.vod.itemCount + sections.series.itemCount > 0;
  const totalFavs = liveFavs + vodFavs + seriesFavs;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8">
      <h1 className="pt-2 text-3xl font-semibold tracking-tight text-fg">Accueil</h1>

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
              <span className="min-w-0 truncate text-xs text-fg">{entry.label ?? 'Chaîne'}</span>
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
