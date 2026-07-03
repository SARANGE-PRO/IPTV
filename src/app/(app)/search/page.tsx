'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ChannelLogo } from '@/components/shared/ChannelLogo';
import { EmptyState } from '@/components/shared/EmptyState';
import { FavoriteButton } from '@/components/shared/FavoriteButton';
import { MediaCard } from '@/components/shared/MediaCard';
import { Button } from '@/components/ui/Button';
import { IconSearch } from '@/components/ui/icons';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import * as catalogRepository from '@/db/repositories/catalogRepository';
import { useDebounce } from '@/hooks/useDebounce';
import { detectFrenchVariant } from '@/services/media/languageDetectionService';
import { useFilterStore } from '@/stores/filterStore';
import type { LiveChannel, Movie, Series } from '@/types/models';
import { displayChannelName, displayTitle, displayYear } from '@/utils/displayTitle';

/**
 * Recherche globale : chaines + films + series en une fois. Chaque source passe
 * par l'index multiEntry Dexie (jamais de scan complet), resultats bornes.
 */
export default function SearchPage() {
  const [query, setQuery] = useState('');
  const debounced = useDebounce(query.trim(), 300);
  const searching = debounced.length >= 2;
  const hiddenLive = useFilterStore((s) => s.hidden.live);
  const hiddenVod = useFilterStore((s) => s.hidden.vod);
  const hiddenSeries = useFilterStore((s) => s.hidden.series);

  const [live, setLive] = useState<LiveChannel[]>([]);
  const [movies, setMovies] = useState<Movie[]>([]);
  const [series, setSeries] = useState<Series[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!searching) {
      setLive([]);
      setMovies([]);
      setSeries([]);
      setError(false);
      return;
    }
    let active = true;
    setLoading(true);
    setError(false);
    void Promise.all([
      catalogRepository.searchLiveChannels(debounced, 24),
      catalogRepository.searchMovies(debounced, 24),
      catalogRepository.searchSeries(debounced, 24),
    ])
      .then(([liveRows, movieRows, seriesRows]) => {
        if (!active) return;
        setLive(liveRows.filter((c) => !hiddenLive.has(c.categoryId)));
        setMovies(movieRows.filter((m) => !hiddenVod.has(m.categoryId)));
        setSeries(seriesRows.filter((s) => !hiddenSeries.has(s.categoryId)));
      })
      .catch(() => {
        if (!active) return;
        // Echec (index Dexie indisponible) : on ne laisse pas de resultats
        // perimes et on propose un retry explicite plutot qu'un ecran fige.
        setLive([]);
        setMovies([]);
        setSeries([]);
        setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [debounced, searching, hiddenLive, hiddenVod, hiddenSeries, retry]);

  const noResult =
    searching && !loading && !error && live.length === 0 && movies.length === 0 && series.length === 0;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8">
      <h1 className="text-2xl font-semibold tracking-tight text-fg">Recherche</h1>

      <div className="mt-4 relative">
        <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-fg-faint" />
        <Input
          className="pl-10"
          placeholder="Chaîne, film ou série…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          inputMode="search"
        />
      </div>

      {!searching && (
        <p className="mt-6 text-sm text-fg-faint">Tape au moins 2 caractères pour chercher partout à la fois.</p>
      )}

      {loading && (
        <div className="mt-6 grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
          {Array.from({ length: 12 }, (_, i) => (
            <Skeleton key={i} className="aspect-[2/3] rounded-xl" />
          ))}
        </div>
      )}

      {live.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold text-fg">Chaînes ({live.length})</h2>
          <div className="flex flex-col sm:grid sm:grid-cols-2 sm:gap-x-4 lg:grid-cols-3">
            {live.map((c) => (
              <div key={c.id} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-ink-800">
                <Link href={`/live/${c.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <ChannelLogo channel={c} className="h-11 w-11 shrink-0" />
                  <span className="min-w-0 flex-1 truncate text-sm text-fg">{displayChannelName(c.name)}</span>
                  {c.isFrench === 1 && (
                    <span className="rounded bg-accent/15 px-1 py-0.5 text-[10px] font-semibold text-accent">FR</span>
                  )}
                </Link>
                <FavoriteButton type="live" itemId={c.id} />
              </div>
            ))}
          </div>
        </section>
      )}

      {movies.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold text-fg">Films ({movies.length})</h2>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
            {movies.map((m) => (
              <MediaCard
                key={m.id}
                href={`/movies/${m.id}`}
                title={displayTitle(m.name)}
                posterUrl={m.posterUrl}
                subtitle={displayYear(m.name, m.year)?.toString() ?? null}
                tag={detectFrenchVariant(m.name) ?? (m.isFrench === 1 ? 'FR' : null)}
                favorite={{ type: 'vod', itemId: m.id }}
              />
            ))}
          </div>
        </section>
      )}

      {series.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold text-fg">Séries ({series.length})</h2>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
            {series.map((s) => (
              <MediaCard
                key={s.id}
                href={`/series/${s.id}`}
                title={displayTitle(s.name)}
                posterUrl={s.posterUrl}
                subtitle={s.releaseDate?.slice(0, 4) ?? null}
                tag={detectFrenchVariant(s.name) ?? (s.isFrench === 1 ? 'FR' : null)}
                favorite={{ type: 'series', itemId: s.id }}
              />
            ))}
          </div>
        </section>
      )}

      {error && !loading && (
        <div className="mt-8">
          <EmptyState
            title="Recherche momentanément indisponible"
            hint="Une erreur est survenue pendant la recherche."
            action={
              <Button size="sm" variant="secondary" onClick={() => setRetry((r) => r + 1)}>
                Réessayer
              </Button>
            }
          />
        </div>
      )}

      {noResult && (
        <div className="mt-8">
          <EmptyState title="Aucun résultat" hint="Essaie un autre titre ou vérifie l’orthographe." />
        </div>
      )}
    </main>
  );
}
