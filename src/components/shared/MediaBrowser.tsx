'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { BrandMark } from '@/components/shared/BrandMark';
import { EmptyState } from '@/components/shared/EmptyState';
import { HScroll } from '@/components/shared/HScroll';
import { MediaCard } from '@/components/shared/MediaCard';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import type { CatalogFilter, FlatSort } from '@/services/data/catalogService';
import { useDebounce } from '@/hooks/useDebounce';
import { useLoadMore } from '@/hooks/useLoadMore';
import { useCatalogStore } from '@/stores/catalogStore';
import { useFilterStore } from '@/stores/filterStore';
import { useVodFilterStore, type VodSection } from '@/stores/vodFilterStore';
import type { BoolNum, MediaType } from '@/types/models';
import { detectFrenchVariant } from '@/services/media/languageDetectionService';
import { displayTitle } from '@/utils/displayTitle';
import { mediaBadges } from '@/utils/mediaBadges';
import { formatCount } from '@/utils/format';

export interface BrowserItem {
  id: string;
  categoryId: string;
  name: string;
  posterUrl: string | null;
  isFrench: BoolNum;
  rating?: number | null;
}

interface MediaBrowserProps<T extends BrowserItem> {
  section: VodSection;
  favoriteType: MediaType;
  title: string;
  itemNoun: string;
  hrefFor: (item: T) => string;
  /** Page « a plat » (toute la collection, filtrée par metadonnees TMDB). */
  fetchFlatPage: (
    offset: number,
    limit: number,
    sort: FlatSort,
    filter: CatalogFilter,
    hidden?: ReadonlySet<string>,
  ) => Promise<T[]>;
  /** Recherche texte croisée avec les filtres TMDB. */
  searchFiltered: (
    query: string,
    filter: CatalogFilter,
    limit: number,
    hidden?: ReadonlySet<string>,
  ) => Promise<T[]>;
  /** Compte (index si sans filtre). Appelé uniquement quand aucun filtre n'est actif. */
  countItems: (filter: CatalogFilter, hidden?: ReadonlySet<string>) => Promise<number>;
  /** Enrichissement TMDB « a la demande » des items affichés (fire-and-forget). */
  enrichVisible?: (items: T[]) => void;
  subtitleFor?: (item: T) => string | null;
  hero?: ReactNode;
}

const PAGE_SIZE = 60;
const SEARCH_LIMIT = 60;

const SORT_OPTIONS: { id: FlatSort; label: string }[] = [
  { id: 'recent', label: 'Récents' },
  { id: 'rating', label: 'Mieux notés' },
  { id: 'year', label: 'Année' },
  { id: 'title', label: 'Titre' },
];

const DECADES: { value: string; label: string; min: number | null; max: number | null }[] = [
  { value: 'all', label: 'Toutes années', min: null, max: null },
  { value: '2020', label: '2020s', min: 2020, max: 2029 },
  { value: '2010', label: '2010s', min: 2010, max: 2019 },
  { value: '2000', label: '2000s', min: 2000, max: 2009 },
  { value: '1990', label: '1990s', min: 1990, max: 1999 },
  { value: 'old', label: 'Avant 1990', min: null, max: 1989 },
];

const RATINGS: { value: string; label: string; min: number | null }[] = [
  { value: 'all', label: 'Toutes notes', min: null },
  { value: '6', label: '★ 6+', min: 6 },
  { value: '7', label: '★ 7+', min: 7 },
  { value: '8', label: '★ 8+', min: 8 },
];

function decadeValue(minYear: number | null, maxYear: number | null): string {
  if (minYear === null && maxYear === 1989) return 'old';
  if (minYear === null && maxYear === null) return 'all';
  return DECADES.find((d) => d.min === minYear && d.max === maxYear)?.value ?? 'all';
}

/**
 * Navigateur générique VOD/Séries « a plat » (refonte, étape 5). Plus de
 * catégories fournisseur : filtres par métadonnées TMDB (genres/année/note), tri
 * global, recherche croisée. La distinction FR/VOSTFR est préservée (toggle FR +
 * badge de variante sur la carte via detectFrenchVariant).
 */
export function MediaBrowser<T extends BrowserItem>({
  section,
  favoriteType,
  title,
  itemNoun,
  hrefFor,
  fetchFlatPage,
  searchFiltered,
  countItems,
  enrichVisible,
  subtitleFor,
  hero,
}: MediaBrowserProps<T>) {
  const catalogSlice = useCatalogStore((s) => s.sections[section]);
  const hiddenSet = useFilterStore((s) => s.hidden[section]);

  const hydrated = useVodFilterStore((s) => s.hydrated);
  const hydrate = useVodFilterStore((s) => s.hydrate);
  const loadGenres = useVodFilterStore((s) => s.loadGenres);
  const filters = useVodFilterStore((s) => s.filters[section]);
  const genres = useVodFilterStore((s) => s.genres[section]);
  const setSort = useVodFilterStore((s) => s.setSort);
  const toggleGenre = useVodFilterStore((s) => s.toggleGenre);
  const clearGenres = useVodFilterStore((s) => s.clearGenres);
  const setGenreMatch = useVodFilterStore((s) => s.setGenreMatch);
  const setYearRange = useVodFilterStore((s) => s.setYearRange);
  const setMinRating = useVodFilterStore((s) => s.setMinRating);
  const setFrenchOnly = useVodFilterStore((s) => s.setFrenchOnly);
  const setUnclassifiedOnly = useVodFilterStore((s) => s.setUnclassifiedOnly);
  const resetFilters = useVodFilterStore((s) => s.resetFilters);

  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [endReached, setEndReached] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<T[] | null>(null);
  const [searching, setSearching] = useState(false);
  const offsetRef = useRef(0);
  const loadingRef = useRef(false);
  const debouncedQuery = useDebounce(query.trim(), 300);

  const active =
    filters.genreIds.length > 0 ||
    filters.minYear !== null ||
    filters.maxYear !== null ||
    filters.minRating !== null ||
    filters.frenchOnly ||
    filters.unclassifiedOnly;
  const hiddenArg = hiddenSet.size > 0 ? hiddenSet : undefined;
  // Objet CatalogFilter stable tant que les filtres de la section ne changent pas.
  const filter = useMemo<CatalogFilter>(() => {
    const cf: CatalogFilter = {};
    if (filters.genreIds.length > 0) {
      cf.genreIds = filters.genreIds;
      cf.genreMatch = filters.genreMatch;
    }
    if (filters.minYear !== null) cf.minYear = filters.minYear;
    if (filters.maxYear !== null) cf.maxYear = filters.maxYear;
    if (filters.minRating !== null) cf.minRating = filters.minRating;
    if (filters.frenchOnly) cf.frenchOnly = true;
    if (filters.unclassifiedOnly) cf.unclassifiedOnly = true;
    return cf;
  }, [filters]);

  useEffect(() => {
    if (!hydrated) void hydrate();
  }, [hydrated, hydrate]);
  useEffect(() => {
    void loadGenres(section);
  }, [loadGenres, section]);

  // Première page à chaque changement de tri/filtre.
  useEffect(() => {
    let alive = true;
    offsetRef.current = 0;
    setItems([]);
    setEndReached(false);
    setLoading(true);
    void fetchFlatPage(0, PAGE_SIZE, filters.sort, filter, hiddenArg).then((first) => {
      if (!alive) return;
      setItems(first);
      offsetRef.current = first.length;
      setEndReached(first.length < PAGE_SIZE);
      setLoading(false);
      enrichVisible?.(first);
    });
    return () => {
      alive = false;
    };
  }, [fetchFlatPage, filters.sort, filter, hiddenArg, enrichVisible]);

  // Compte total : seulement sans filtre actif (compte d'index rapide).
  useEffect(() => {
    if (active || debouncedQuery.length >= 2) {
      setCount(null);
      return;
    }
    let alive = true;
    void countItems({}, hiddenArg).then((n) => {
      if (alive) setCount(n);
    });
    return () => {
      alive = false;
    };
  }, [countItems, active, debouncedQuery, hiddenArg]);

  // Recherche indexée croisée avec les filtres.
  useEffect(() => {
    if (debouncedQuery.length < 2) {
      setResults(null);
      setSearching(false);
      return;
    }
    let alive = true;
    setSearching(true);
    void searchFiltered(debouncedQuery, filter, SEARCH_LIMIT, hiddenArg).then((r) => {
      if (!alive) return;
      setResults(r);
      setSearching(false);
      enrichVisible?.(r);
    });
    return () => {
      alive = false;
    };
  }, [debouncedQuery, searchFiltered, filter, hiddenArg, enrichVisible]);

  const loadMore = () => {
    if (loadingRef.current || endReached || results !== null) return;
    loadingRef.current = true;
    setLoading(true);
    void fetchFlatPage(offsetRef.current, PAGE_SIZE, filters.sort, filter, hiddenArg).then((page) => {
      offsetRef.current += page.length;
      setItems((prev) => [...prev, ...page]);
      if (page.length < PAGE_SIZE) setEndReached(true);
      loadingRef.current = false;
      setLoading(false);
      enrichVisible?.(page);
    });
  };

  const shown = results ?? items;
  const sentinelRef = useLoadMore(loadMore, results === null && !endReached && items.length > 0);

  const catalogEmpty = catalogSlice.itemCount === 0 && catalogSlice.status !== 'loading';
  const selectClass =
    'h-10 rounded-xl border border-ink-600 bg-ink-800 px-3 text-xs text-fg outline-none';
  const decade = decadeValue(filters.minYear, filters.maxYear);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8">
      <h1 className="sr-only">{title}</h1>
      <div className="flex justify-end md:hidden">
        <BrandMark />
      </div>

      {hero}

      {/* Recherche + tri + année + note */}
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex-1">
          <Input
            placeholder={`Rechercher des ${itemNoun}…`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            inputMode="search"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Trier"
            value={filters.sort}
            onChange={(e) => setSort(section, e.target.value as FlatSort)}
            className={selectClass}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
          <select
            aria-label="Filtrer par année"
            value={decade}
            onChange={(e) => {
              const d = DECADES.find((x) => x.value === e.target.value) ?? DECADES[0]!;
              setYearRange(section, d.min, d.max);
            }}
            className={selectClass}
          >
            {DECADES.map((d) => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>
          <select
            aria-label="Filtrer par note"
            value={filters.minRating === null ? 'all' : String(filters.minRating)}
            onChange={(e) => {
              const r = RATINGS.find((x) => x.value === e.target.value) ?? RATINGS[0]!;
              setMinRating(section, r.min);
            }}
            className={selectClass}
          >
            {RATINGS.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Toggles VF / Non classés / ET-OU / reset */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <TogglePill active={filters.frenchOnly} onClick={() => setFrenchOnly(section, !filters.frenchOnly)}>
          VF / FR
        </TogglePill>
        <TogglePill
          active={filters.unclassifiedOnly}
          onClick={() => setUnclassifiedOnly(section, !filters.unclassifiedOnly)}
        >
          Non classés
        </TogglePill>
        {filters.genreIds.length > 1 && (
          <TogglePill
            active={filters.genreMatch === 'all'}
            onClick={() => setGenreMatch(section, filters.genreMatch === 'all' ? 'any' : 'all')}
          >
            {filters.genreMatch === 'all' ? 'Tous les genres (ET)' : 'Au moins un genre (OU)'}
          </TogglePill>
        )}
        {active && (
          <button
            onClick={() => resetFilters(section)}
            className="rounded-full px-3 py-2 text-[13px] font-medium text-fg-faint underline-offset-2 hover:text-fg hover:underline"
          >
            Réinitialiser
          </button>
        )}
      </div>

      {/* Pills de genres TMDB */}
      {genres.length > 0 && (
        <HScroll className="mt-3 flex gap-2 pb-1 [scrollbar-width:none]">
          <button
            onClick={() => clearGenres(section)}
            className={`shrink-0 rounded-full px-4 py-2 text-[13px] font-medium transition-colors ${
              filters.genreIds.length === 0 ? 'bg-accent text-white' : 'bg-ink-800 text-fg-muted hover:text-fg'
            }`}
          >
            Tous
          </button>
          {genres.map((g) => {
            const on = filters.genreIds.includes(g.id);
            return (
              <button
                key={g.id}
                onClick={() => toggleGenre(section, g.id)}
                className={`shrink-0 rounded-full px-4 py-2 text-[13px] font-medium transition-colors ${
                  on ? 'bg-accent text-white' : 'bg-ink-800 text-fg-muted hover:text-fg'
                }`}
              >
                {g.name}
              </button>
            );
          })}
        </HScroll>
      )}

      {/* Compteur */}
      {results !== null ? (
        <p className="mt-3 text-xs text-fg-faint">
          {results.length >= SEARCH_LIMIT
            ? `${SEARCH_LIMIT}+ résultats — affine ta recherche`
            : `${results.length} résultat${results.length > 1 ? 's' : ''}`}
        </p>
      ) : active ? (
        <p className="mt-3 text-xs text-fg-faint">
          {formatCount(items.length)}
          {endReached ? '' : '+'} {itemNoun}
        </p>
      ) : count !== null ? (
        <p className="mt-3 text-xs text-fg-faint">
          {formatCount(count)} {itemNoun}
        </p>
      ) : null}

      {catalogEmpty ? (
        <div className="mt-6">
          <EmptyState
            title="Catalogue non synchronisé"
            hint="Lance une synchronisation depuis les réglages pour charger le catalogue."
          />
        </div>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
            {shown.map((item) => (
              <MediaCard
                key={item.id}
                href={hrefFor(item)}
                title={displayTitle(item.name)}
                posterUrl={item.posterUrl}
                subtitle={subtitleFor?.(item) ?? undefined}
                quality={mediaBadges(item.name, null).find((b) => b.tone === 'quality')?.label ?? null}
                rating={item.rating ?? null}
                tag={detectFrenchVariant(item.name) ?? (item.isFrench === 1 ? 'FR' : null)}
                favorite={{ type: favoriteType, itemId: item.id }}
              />
            ))}
            {(loading || searching) &&
              shown.length === 0 &&
              Array.from({ length: 12 }, (_, i) => <Skeleton key={i} className="aspect-[2/3] rounded-xl" />)}
          </div>

          {results !== null && results.length === 0 && !searching && (
            <div className="mt-6">
              <EmptyState title="Aucun résultat" hint="Essaie un autre titre ou ajuste les filtres." />
            </div>
          )}
          {results === null && !loading && shown.length === 0 && (
            <div className="mt-6">
              <EmptyState
                title={active ? 'Aucun contenu pour ces filtres' : 'Catégorie vide'}
                hint={active ? 'Élargis ou réinitialise les filtres.' : undefined}
              />
            </div>
          )}

          {results === null && <div ref={sentinelRef} className="h-10" />}
          {loading && items.length > 0 && (
            <p className="py-4 text-center text-xs text-fg-faint">Chargement…</p>
          )}
        </>
      )}
    </main>
  );
}

function TogglePill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`shrink-0 rounded-full px-4 py-2 text-[13px] font-medium transition-colors ${
        active ? 'bg-accent text-white' : 'bg-ink-800 text-fg-muted hover:text-fg'
      }`}
    >
      {children}
    </button>
  );
}
