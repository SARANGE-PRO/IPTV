'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ChannelLogo } from '@/components/shared/ChannelLogo';
import { EmptyState } from '@/components/shared/EmptyState';
import { FavoriteButton } from '@/components/shared/FavoriteButton';
import { MediaCard } from '@/components/shared/MediaCard';
import { PosterImage } from '@/components/shared/PosterImage';
import { Button } from '@/components/ui/Button';
import { IconSearch, IconX } from '@/components/ui/icons';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { useSearch } from '@/hooks/useSearch';
import { tmdbPoster } from '@/services/tmdb/tmdbImage';
import type { Movie, Series } from '@/types/models';
import { useLiveUiStore } from '@/stores/liveUiStore';
import { LIVE_HREF, liveHref, movieHref, seriesHref } from '@/utils/appRoutes';
import { displayChannelName, displayTitle, displayYear } from '@/utils/displayTitle';
import { variantBadge } from '@/utils/variantPreference';
import { setZapContext } from '@/services/live/liveZappingService';

/** Comparaison souple : casse et accents ignores. */
function normalizeQuery(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * RECHERCHE facon Netflix (chantier P7) : titres (une carte par titre, version
 * preferee en tete), genre (« comedie »), personne (« dicaprio » -> sa
 * filmographie presente au catalogue), chaines. Requete vide : recherches
 * recentes + tendances. Etat dans l'URL (?q=) : restaure au retour / partage.
 */

function initialQuery(): string {
  if (typeof window === 'undefined') return '';
  return new URLSearchParams(window.location.search).get('q') ?? '';
}

const GRID = 'grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6';

function MovieTile({ movie }: { movie: Movie }) {
  const year = displayYear(movie.name, movie.tmdbYear ?? movie.year);
  return (
    <MediaCard
      href={movieHref(movie.id)}
      title={displayTitle(movie.name)}
      posterUrl={movie.posterUrl}
      subtitle={year !== null ? String(year) : null}
      rating={movie.ratingSort > 0 ? movie.ratingSort : null}
      tag={variantBadge(movie.variant, movie.variantSource)}
      favorite={{ type: 'vod', itemId: movie.id }}
    />
  );
}

function SeriesTile({ series }: { series: Series }) {
  const year = series.tmdbYear ?? series.year;
  return (
    <MediaCard
      href={seriesHref(series.id)}
      title={displayTitle(series.name)}
      posterUrl={series.posterUrl}
      subtitle={year !== null ? String(year) : null}
      rating={series.ratingSort > 0 ? series.ratingSort : null}
      tag={variantBadge(series.variant, series.variantSource)}
      favorite={{ type: 'series', itemId: series.id }}
    />
  );
}

function Section({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-sm font-semibold text-fg">{title}</h2>
      {children}
    </section>
  );
}

export default function SearchPage() {
  const [query, setQuery] = useState(initialQuery);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const s = useSearch(query);
  const router = useRouter();

  // Requete dans l'URL SANS navigation (replaceState) : retour arriere = ecran restaure.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const q = query.trim();
    const next = q === '' ? window.location.pathname : `${window.location.pathname}?q=${encodeURIComponent(q)}`;
    window.history.replaceState(window.history.state, '', next);
  }, [query]);

  const { titles, genres, person } = s;
  const hasAny =
    titles.movies.length + titles.series.length + titles.live.length + genres.length + (person !== null ? 1 : 0) > 0;
  const noResult = s.active && !s.loading && !s.error && !s.personLoading && !hasAny;
  // Ouvrir un resultat = la recherche merite d'etre retenue.
  const rememberOnOpen = () => s.remember(s.debounced);
  const trendingItems = [...s.trending.movies, ...s.trending.series];

  // « TF1 », « bein » : on cherche une chaine -> chaines AVANT les films.
  const needle = normalizeQuery(query);
  const channelsFirst =
    needle !== '' && titles.live.some((c) => normalizeQuery(displayChannelName(c.name)).startsWith(needle));
  const channelsSection =
    titles.live.length > 0 ? (
      <Section title={`Chaînes (${titles.liveTotal})`}>
        <div className="flex flex-col sm:grid sm:grid-cols-2 sm:gap-x-4">
          {titles.live.map((c) => (
            <div key={c.id} className="flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-ink-800">
              <Link
                href={liveHref(c.id)}
                // ⏮ ⏭ / swipe = ces resultats, pas la derniere liste Live visitee.
                onClick={() =>
                  setZapContext({
                    label: 'Résultats de recherche',
                    entries: titles.live.map((ch) => ({ id: ch.id, groupKey: null })),
                  })
                }
                className="flex min-w-0 flex-1 items-center gap-3"
              >
                <ChannelLogo channel={c} className="h-11 w-11 shrink-0" />
                <span className="min-w-0 flex-1 truncate text-sm text-fg">{displayChannelName(c.name)}</span>
                {c.isFrench === 1 && (
                  <span className="rounded bg-accent/15 px-1 py-0.5 text-[10px] font-semibold text-accent">FR</span>
                )}
              </Link>
              <FavoriteButton type="live" itemId={c.id} className="bg-transparent" />
            </div>
          ))}
        </div>
              {titles.liveTotal > titles.live.length && (
          <button
            type="button"
            onClick={() => {
              // La page Live s'ouvre sur CETTE recherche, avec tous les resultats (pages).
              useLiveUiStore.getState().save({ view: 'france', query: s.debounced, visible: 80, scrollY: 0 });
              rememberOnOpen();
              router.push(LIVE_HREF);
            }}
            className="mt-2 flex h-11 w-full items-center justify-center rounded-xl bg-ink-800 text-sm font-medium text-fg hover:bg-ink-700"
          >
            Voir les {titles.liveTotal} chaînes
          </button>
        )}
      </Section>
    ) : null;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8">
      <h1 className="sr-only">Recherche</h1>
      <div className="relative">
        <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-fg-faint" />
        <Input
          ref={inputRef}
          className="pl-10 pr-10"
          placeholder="Titre, acteur, genre, chaîne…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            s.remember(query);
            // Ferme le clavier : les resultats deviennent visibles.
            e.currentTarget.blur();
          }}
          type="search"
          enterKeyHint="search"
          autoFocus
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
        {query !== '' && (
          <button
            type="button"
            aria-label="Effacer la recherche"
            onClick={() => {
              setQuery('');
              inputRef.current?.focus();
            }}
            className="absolute right-1 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full text-fg-faint hover:text-fg"
          >
            <IconX className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Requete vide : recherches recentes + tendances */}
      {!s.active && (
        <>
          {s.recent.length > 0 && (
            <section className="mt-6">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-fg">Recherches récentes</h2>
                <button type="button" onClick={s.clearRecent} className="-my-2 px-2 py-3 text-xs text-fg-faint hover:text-fg">
                  Effacer
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {s.recent.map((r) => (
                  <span key={r} className="flex items-center gap-1 rounded-full bg-ink-800 pl-3.5 pr-1 text-sm text-fg-muted">
                    <button type="button" onClick={() => setQuery(r)} className="py-2.5 hover:text-fg">
                      {r}
                    </button>
                    <button
                      type="button"
                      aria-label={`Retirer ${r}`}
                      onClick={() => s.forget(r)}
                      className="grid h-9 w-9 place-items-center rounded-full text-fg-faint hover:text-fg"
                    >
                      <IconX className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ))}
              </div>
            </section>
          )}
          {trendingItems.length > 0 ? (
            <Section title="Tendances de la semaine">
              <div className={GRID}>
                {trendingItems.map((t) => (
                  <MediaCard
                    key={`${t.type}:${t.xtreamId}`}
                    href={t.type === 'vod' ? movieHref(t.xtreamId) : seriesHref(t.xtreamId)}
                    title={t.title}
                    posterUrl={tmdbPoster(t.posterPath)}
                    subtitle={t.type === 'vod' ? 'Film' : 'Série'}
                    rating={t.rating}
                    tag={variantBadge(t.variant, t.variantSource)}
                  />
                ))}
              </div>
            </Section>
          ) : (
            <p className="mt-6 text-sm text-fg-faint">Cherche un titre, un acteur, un réalisateur, un genre ou une chaîne.</p>
          )}
        </>
      )}

      {s.active && s.loading && !hasAny && (
        <div className={`mt-6 ${GRID}`}>
          {Array.from({ length: 12 }, (_, i) => (
            <Skeleton key={i} className="aspect-[2/3] rounded-xl" />
          ))}
        </div>
      )}

      {s.active && (
        <div onClickCapture={rememberOnOpen}>
          {channelsFirst && channelsSection}
          {titles.movies.length > 0 && (
            <Section title={`Films (${titles.movies.length})`}>
              <div className={GRID}>
                {titles.movies.map((m) => (
                  <MovieTile key={m.id} movie={m} />
                ))}
              </div>
            </Section>
          )}

          {titles.series.length > 0 && (
            <Section title={`Séries (${titles.series.length})`}>
              <div className={GRID}>
                {titles.series.map((x) => (
                  <SeriesTile key={x.id} series={x} />
                ))}
              </div>
            </Section>
          )}

          {person !== null && (
            <Section
              title={
                <span className="flex items-center gap-3">
                  <PosterImage src={person.photo} alt={person.name} className="h-10 w-10 shrink-0 rounded-full" />
                  <span>
                    Avec {person.name}
                    <span className="block text-[11px] font-normal text-fg-faint">{person.role}</span>
                  </span>
                </span>
              }
            >
              <div className={GRID}>
                {person.movies.map((m) => (
                  <MovieTile key={`p:${m.id}`} movie={m} />
                ))}
                {person.series.map((x) => (
                  <SeriesTile key={`p:${x.id}`} series={x} />
                ))}
              </div>
            </Section>
          )}

          {genres.map((g) => (
            <Section key={`${g.type}:${g.genreId}`} title={`${g.type === 'vod' ? 'Films' : 'Séries'} · ${g.name}`}>
              <div className={GRID}>
                {g.type === 'vod'
                  ? g.movies.map((m) => <MovieTile key={`g:${m.id}`} movie={m} />)
                  : g.series.map((x) => <SeriesTile key={`g:${x.id}`} series={x} />)}
              </div>
            </Section>
          ))}

          {!channelsFirst && channelsSection}

          {s.personLoading && hasAny && (
            <p className="mt-6 text-center text-xs text-fg-faint">Recherche des acteurs et réalisateurs…</p>
          )}
        </div>
      )}

      {s.error && !s.loading && (
        <div className="mt-8">
          <EmptyState
            title="Recherche momentanément indisponible"
            hint="Une erreur est survenue pendant la recherche."
            action={
              <Button size="sm" variant="secondary" onClick={s.retry}>
                Réessayer
              </Button>
            }
          />
        </div>
      )}

      {noResult && (
        <div className="mt-8">
          <EmptyState title="Aucun résultat" hint="Essaie un autre titre, un acteur, un genre, ou vérifie l’orthographe." />
        </div>
      )}
    </main>
  );
}
