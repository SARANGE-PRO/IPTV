'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CategoryPanel } from '@/components/shared/CategoryPanel';
import { CountrySelect } from '@/components/shared/CountrySelect';
import { EmptyState } from '@/components/shared/EmptyState';
import { MediaCard } from '@/components/shared/MediaCard';
import { IconChevronDown } from '@/components/ui/icons';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import * as catalogRepository from '@/db/repositories/catalogRepository';
import { useDebounce } from '@/hooks/useDebounce';
import { useLoadMore } from '@/hooks/useLoadMore';
import { useCatalogStore } from '@/stores/catalogStore';
import { useFilterStore } from '@/stores/filterStore';
import type { BoolNum, MediaType, Section } from '@/types/models';
import { prioritizeCategories } from '@/utils/categoryPriority';
import { formatCount } from '@/utils/format';

export interface BrowserItem {
  id: string;
  name: string;
  posterUrl: string | null;
  isFrench: BoolNum;
}

interface MediaBrowserProps<T extends BrowserItem> {
  section: Section;
  favoriteType: MediaType;
  title: string;
  itemNoun: string;
  hrefFor: (item: T) => string;
  fetchPage: (categoryId: string, offset: number, limit: number) => Promise<T[]>;
  searchItems: (query: string, limit: number) => Promise<T[]>;
  subtitleFor?: (item: T) => string | null;
}

const PAGE_SIZE = 60;
const SEARCH_LIMIT = 60;

/** Navigateur generique VOD/Series : categories priorisees FR + grille paginee Dexie. */
export function MediaBrowser<T extends BrowserItem>({
  section,
  favoriteType,
  title,
  itemNoun,
  hrefFor,
  fetchPage,
  searchItems,
  subtitleFor,
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

  // Selection automatique + retombee si la categorie courante est masquee.
  useEffect(() => {
    const first = categories[0];
    if (first === undefined) return;
    if (selectedId === null || !categories.some((c) => c.id === selectedId)) {
      setSelectedId(first.id);
    }
  }, [categories, selectedId]);

  // Premiere page a chaque changement de categorie.
  useEffect(() => {
    if (selectedId === null) return;
    let active = true;
    offsetRef.current = 0;
    setItems([]);
    setEndReached(false);
    setCount(null);
    setLoading(true);
    void fetchPage(selectedId, 0, PAGE_SIZE).then((first) => {
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
  }, [selectedId, section, fetchPage]);

  // Pages suivantes (sentinelle).
  const loadMore = () => {
    if (loadingRef.current || endReached || selectedId === null) return;
    loadingRef.current = true;
    setLoading(true);
    void fetchPage(selectedId, offsetRef.current, PAGE_SIZE).then((page) => {
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
    void searchItems(debouncedQuery, SEARCH_LIMIT).then((r) => {
      if (active) {
        setResults(r);
        setSearching(false);
      }
    });
    return () => {
      active = false;
    };
  }, [debouncedQuery, searchItems]);

  const shown = results ?? items;
  const sentinelRef = useLoadMore(loadMore, results === null && !endReached && items.length > 0);
  const catalogEmpty = slice.categories.length === 0 && slice.status !== 'loading';

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8">
      <h1 className="text-2xl font-semibold tracking-tight text-fg">{title}</h1>

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
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPanelOpen(true)}
            className="flex h-10 max-w-56 items-center gap-2 rounded-xl border border-ink-600 bg-ink-800 px-3 text-sm text-fg"
          >
            <span className="truncate">{selected?.name ?? 'Catégories'}</span>
            <IconChevronDown className="h-4 w-4 shrink-0 text-fg-faint" />
          </button>
          <CountrySelect value={country} countries={countries} onChange={setCountry} />
        </div>
      </div>

      {results === null && count !== null && (
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
                title={item.name}
                posterUrl={item.posterUrl}
                subtitle={subtitleFor?.(item) ?? undefined}
                favorite={{ type: favoriteType, itemId: item.id }}
              />
            ))}
            {(loading || searching) &&
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
          {results === null && !loading && items.length === 0 && selected !== null && (
            <div className="mt-6">
              <EmptyState title="Catégorie vide" />
            </div>
          )}

          {results === null && <div ref={sentinelRef} className="h-10" />}
          {loading && items.length > 0 && (
            <p className="py-4 text-center text-xs text-fg-faint">Chargement…</p>
          )}
        </>
      )}

      <CategoryPanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        categories={categories}
        selectedId={selectedId}
        onSelect={setSelectedId}
        section={section}
      />
    </main>
  );
}
