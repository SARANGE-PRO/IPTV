'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { BrandMark } from '@/components/shared/BrandMark';
import { CategoryPanel } from '@/components/shared/CategoryPanel';
import { CountrySelect } from '@/components/shared/CountrySelect';
import { EmptyState } from '@/components/shared/EmptyState';
import { HScroll } from '@/components/shared/HScroll';
import { MediaCard } from '@/components/shared/MediaCard';
import { IconChevronDown } from '@/components/ui/icons';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import * as catalogRepository from '@/services/data/catalogService';
import type { CatalogSort } from '@/services/data/catalogService';
import * as settingsRepository from '@/services/data/settingsDataService';
import { useDebounce } from '@/hooks/useDebounce';
import { useLoadMore } from '@/hooks/useLoadMore';
import { useCatalogStore } from '@/stores/catalogStore';
import { useFilterStore } from '@/stores/filterStore';
import type { BoolNum, MediaType, Section } from '@/types/models';
import { detectFrenchVariant } from '@/services/media/languageDetectionService';
import { prioritizeCategories } from '@/utils/categoryPriority';
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
  year?: number | null;
  addedAt?: number | null;
  lastModifiedAt?: number | null;
  releaseDate?: string | null;
}

export interface QuickFilterDefinition {
  id: string;
  label: string;
  /** Si present, le chip ouvre la meilleure categorie correspondante. */
  categoryKeywords?: string[];
}

export interface SortOption {
  id: CatalogSort;
  label: string;
}

interface MediaBrowserProps<T extends BrowserItem> {
  section: Section;
  favoriteType: MediaType;
  title: string;
  itemNoun: string;
  hrefFor: (item: T) => string;
  fetchPage: (categoryId: string, offset: number, limit: number, sort: CatalogSort) => Promise<T[]>;
  searchItems: (query: string, limit: number, hiddenCategoryIds?: ReadonlySet<string>) => Promise<T[]>;
  quickFilters?: QuickFilterDefinition[];
  fetchQuickFilter?: (filterId: string, limit: number) => Promise<T[]>;
  sortOptions?: SortOption[];
  subtitleFor?: (item: T) => string | null;
  /** Hero editorial optionnel (rendu en tete, avant la barre de recherche). */
  hero?: ReactNode;
}

const PAGE_SIZE = 60;
const SEARCH_LIMIT = 60;
const SMART_LIMIT = 120;

const DEFAULT_SORT_OPTIONS: SortOption[] = [
  { id: 'recommended', label: 'Recommande' },
  { id: 'recent', label: 'Recemment ajoute' },
  { id: 'rating', label: 'Mieux note' },
  { id: 'title', label: 'Titre' },
];

function sortBoundedItems<T extends BrowserItem>(items: T[], sort: CatalogSort): T[] {
  if (sort === 'recommended') return items;
  return [...items].sort((a, b) => {
    if (sort === 'rating') return (b.rating ?? -1) - (a.rating ?? -1);
    if (sort === 'year') return (b.year ?? Number.parseInt(b.releaseDate?.slice(0, 4) ?? '0', 10)) -
      (a.year ?? Number.parseInt(a.releaseDate?.slice(0, 4) ?? '0', 10));
    if (sort === 'recent') return (b.addedAt ?? b.lastModifiedAt ?? 0) - (a.addedAt ?? a.lastModifiedAt ?? 0);
    return a.name.localeCompare(b.name, 'fr');
  });
}

/** Navigateur generique VOD/Series : categories priorisees FR + grille paginee Dexie. */
export function MediaBrowser<T extends BrowserItem>({
  section,
  favoriteType,
  title,
  itemNoun,
  hrefFor,
  fetchPage,
  searchItems,
  quickFilters = [],
  fetchQuickFilter,
  sortOptions = DEFAULT_SORT_OPTIONS,
  subtitleFor,
  hero,
}: MediaBrowserProps<T>) {
  const slice = useCatalogStore((s) => s.sections[section]);
  const country = useFilterStore((s) => s.country);
  const setCountry = useFilterStore((s) => s.setCountry);
  const hidden = useFilterStore((s) => s.hidden[section]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [endReached, setEndReached] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<CatalogSort>('recommended');
  const [activeChip, setActiveChip] = useState<string | null>(null);
  const [activeQuick, setActiveQuick] = useState<string | null>(null);
  const [smartItems, setSmartItems] = useState<T[]>([]);
  const [smartLoading, setSmartLoading] = useState(false);
  const debouncedQuery = useDebounce(query.trim(), 300);
  const [results, setResults] = useState<T[] | null>(null);
  const [searching, setSearching] = useState(false);
  const offsetRef = useRef(0);
  const loadingRef = useRef(false);

  const categories = useMemo(
    () => prioritizeCategories(slice.categories, country, hidden),
    [slice.categories, country, hidden],
  );
  const countries = useMemo(
    () => slice.categories.map((c) => c.country).filter((c): c is string => c !== null),
    [slice.categories],
  );
  const selected = useMemo(
    () => categories.find((c) => c.id === selectedId) ?? null,
    [categories, selectedId],
  );

  // Restaure le dernier tri choisi pour cette section (confort au retour).
  useEffect(() => {
    let active = true;
    void settingsRepository.getSetting<CatalogSort>(`catalogSort:${section}`).then((saved) => {
      if (active && saved !== undefined && sortOptions.some((option) => option.id === saved)) {
        setSort(saved);
      }
    });
    return () => {
      active = false;
    };
  }, [section, sortOptions]);

  // Selection automatique + retombee si la categorie courante est masquee.
  useEffect(() => {
    const first = categories[0];
    if (first === undefined) return;
    if (selectedId === null || !categories.some((c) => c.id === selectedId)) {
      setSelectedId(first.id);
    }
  }, [categories, selectedId]);

  // Premiere page a chaque changement de categorie/tri.
  useEffect(() => {
    if (selectedId === null || activeQuick !== null) return;
    let active = true;
    offsetRef.current = 0;
    setItems([]);
    setEndReached(false);
    setCount(null);
    setLoading(true);
    void fetchPage(selectedId, 0, PAGE_SIZE, sort).then((first) => {
      if (!active) return;
      setItems(first);
      offsetRef.current = first.length;
      setEndReached(first.length < PAGE_SIZE);
      setLoading(false);
    });
    void catalogRepository.countByCategory(section, selectedId).then((n) => {
      if (active) setCount(n);
    });
    return () => {
      active = false;
    };
  }, [selectedId, section, fetchPage, sort, activeQuick]);

  // Vues intelligentes bornees (FR, nouveautes, Top 10, tags qualite...).
  useEffect(() => {
    if (activeQuick === null || fetchQuickFilter === undefined) {
      setSmartItems([]);
      setSmartLoading(false);
      return;
    }
    let active = true;
    setSmartLoading(true);
    void fetchQuickFilter(activeQuick, SMART_LIMIT)
      .then((rows) => {
        if (active) setSmartItems(rows.filter((item) => !hidden.has(item.categoryId)));
      })
      .finally(() => {
        if (active) setSmartLoading(false);
      });
    return () => {
      active = false;
    };
  }, [activeQuick, fetchQuickFilter, hidden]);

  // Pages suivantes (sentinelle).
  const loadMore = () => {
    if (loadingRef.current || endReached || selectedId === null || activeQuick !== null) return;
    loadingRef.current = true;
    setLoading(true);
    void fetchPage(selectedId, offsetRef.current, PAGE_SIZE, sort).then((page) => {
      offsetRef.current += page.length;
      setItems((prev) => [...prev, ...page]);
      if (page.length < PAGE_SIZE) setEndReached(true);
      loadingRef.current = false;
      setLoading(false);
    });
  };

  // Recherche indexee.
  useEffect(() => {
    if (debouncedQuery.length < 2) {
      setResults(null);
      setSearching(false);
      return;
    }
    let active = true;
    setSearching(true);
    // Exclusion des categories masquees AVANT la limite (cote repository).
    void searchItems(debouncedQuery, SEARCH_LIMIT, hidden).then((r) => {
      if (active) {
        setResults(r);
        setSearching(false);
      }
    });
    return () => {
      active = false;
    };
  }, [debouncedQuery, searchItems, hidden]);

  const baseItems = activeQuick !== null ? smartItems : items;
  const shown = useMemo(
    () => sortBoundedItems(results ?? baseItems, sort),
    [results, baseItems, sort],
  );
  const sentinelRef = useLoadMore(
    loadMore,
    results === null && activeQuick === null && !endReached && items.length > 0,
  );
  const catalogEmpty = slice.categories.length === 0 && slice.status !== 'loading';

  const visibleQuickFilters = useMemo(
    () =>
      quickFilters.filter(
        (quick) =>
          quick.categoryKeywords === undefined ||
          categories.some((category) =>
            quick.categoryKeywords?.some((keyword) => category.normalizedName.includes(keyword)),
          ),
      ),
    [quickFilters, categories],
  );

  const activateQuick = (quick: QuickFilterDefinition) => {
    setQuery('');
    setResults(null);
    setActiveChip(quick.id);
    if (quick.categoryKeywords !== undefined) {
      const category = categories.find((candidate) =>
        quick.categoryKeywords?.some((keyword) => candidate.normalizedName.includes(keyword)),
      );
      if (category !== undefined) {
        setActiveQuick(null);
        setSelectedId(category.id);
      }
      return;
    }
    setActiveQuick(quick.id);
  };

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-fg">{title}</h1>
        <BrandMark className="md:hidden" />
      </div>

      {hero}

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
          <button
            onClick={() => setPanelOpen(true)}
            className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-xl border border-ink-600 bg-ink-800 px-3 text-sm text-fg sm:max-w-56 sm:flex-none"
          >
            <span className="truncate">{selected?.name ?? 'Catégories'}</span>
            <IconChevronDown className="h-4 w-4 shrink-0 text-fg-faint" />
          </button>
          <CountrySelect value={country} countries={countries} onChange={setCountry} />
          <select
            aria-label="Trier les contenus"
            value={sort}
            onChange={(event) => {
              const next = event.target.value as CatalogSort;
              setSort(next);
              void settingsRepository.setSetting(`catalogSort:${section}`, next);
            }}
            className="h-10 min-w-0 flex-1 rounded-xl border border-ink-600 bg-ink-800 px-3 text-xs text-fg outline-none sm:max-w-44 sm:flex-none"
          >
            {sortOptions.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        </div>
      </div>

      {visibleQuickFilters.length > 0 && (
        <HScroll className="mt-3 flex gap-2 pb-1 [scrollbar-width:none]">
          {visibleQuickFilters.map((quick) => (
            <button
              key={quick.id}
              onClick={() => activateQuick(quick)}
              className={`shrink-0 rounded-full px-4 py-2 text-[13px] font-medium transition-colors ${
                activeChip === quick.id
                  ? 'bg-accent text-white'
                  : 'bg-ink-800 text-fg-muted hover:text-fg'
              }`}
            >
              {quick.label}
            </button>
          ))}
        </HScroll>
      )}

      {results === null && activeQuick === null && count !== null && (
        <p className="mt-3 text-xs text-fg-faint">
          {formatCount(count)} {itemNoun}
        </p>
      )}
      {results !== null && (
        <p className="mt-3 text-xs text-fg-faint">
          {results.length >= SEARCH_LIMIT
            ? `${SEARCH_LIMIT}+ résultats — affine ta recherche`
            : `${results.length} résultat${results.length > 1 ? 's' : ''}`}
        </p>
      )}
      {results === null && activeQuick !== null && (
        <p className="mt-3 text-xs text-fg-faint">
          {smartItems.length} selection{smartItems.length > 1 ? 's' : ''} sur un pool borne et indexe
        </p>
      )}

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
            {(loading || searching || smartLoading) &&
              shown.length === 0 &&
              Array.from({ length: 12 }, (_, i) => (
                <Skeleton key={i} className="aspect-[2/3] rounded-xl" />
              ))}
          </div>

          {results !== null && results.length === 0 && !searching && (
            <div className="mt-6">
              <EmptyState title="Aucun résultat" hint="Essaie un autre titre ou vérifie l’orthographe." />
            </div>
          )}
          {results === null && !loading && !smartLoading && shown.length === 0 && selected !== null && (
            <div className="mt-6">
              <EmptyState title="Catégorie vide" />
            </div>
          )}

          {results === null && activeQuick === null && <div ref={sentinelRef} className="h-10" />}
          {loading && activeQuick === null && items.length > 0 && (
            <p className="py-4 text-center text-xs text-fg-faint">Chargement…</p>
          )}
        </>
      )}

      <CategoryPanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        categories={categories}
        selectedId={selectedId}
        onSelect={(id) => {
          setActiveChip(null);
          setActiveQuick(null);
          setSelectedId(id);
        }}
        section={section}
      />
    </main>
  );
}
