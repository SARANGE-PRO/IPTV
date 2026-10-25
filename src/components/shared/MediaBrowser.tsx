'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { BrandMark } from '@/components/shared/BrandMark';
import { EmptyState } from '@/components/shared/EmptyState';
import { ErrorState } from '@/components/shared/ErrorState';
import { HScroll } from '@/components/shared/HScroll';
import { MediaCard } from '@/components/shared/MediaCard';
import { SyncCatalogButton } from '@/components/shared/SyncCatalogButton';
import { IconSearch, IconX } from '@/components/ui/icons';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { FIRST_PAGE } from '@/services/data/catalogService';
import type { CatalogFilter, CatalogPage, FlatSort, LaneFilter, PageCursor } from '@/services/data/catalogService';
import { useCatalogSync } from '@/hooks/useCatalogSync';
import { useDebounce } from '@/hooks/useDebounce';
import { cn } from '@/lib/cn';
import { useLoadMore } from '@/hooks/useLoadMore';
import { useCatalogStore } from '@/stores/catalogStore';
import { useFilterStore } from '@/stores/filterStore';
import { useUiSettingsStore } from '@/stores/uiSettingsStore';
import { useVodFilterStore, type VodSection } from '@/stores/vodFilterStore';
import type { MediaVariant, VariantSource } from '@/types/mediaLanguage';
import { displayTitle } from '@/utils/displayTitle';
import { mediaBadges } from '@/utils/mediaBadges';
import { formatCount } from '@/utils/format';
import { variantBadge, variantOrder } from '@/utils/variantPreference';

export interface BrowserItem {
  id: string;
  categoryId: string;
  name: string;
  posterUrl: string | null;
  /** Note de tri (TMDB si enrichi, sinon fournisseur, 0 = inconnue). */
  ratingSort: number;
  variant: MediaVariant;
  variantSource: VariantSource;
}

interface MediaBrowserProps<T extends BrowserItem> {
  section: VodSection;
  title: string;
  itemNoun: string;
  hrefFor: (item: T) => string;
  /** Page « a plat » : tiers de langue + filtres TMDB, curseur multi-tiers. */
  fetchFlatPage: (
    cursor: PageCursor,
    limit: number,
    sort: FlatSort,
    lane: LaneFilter,
    order: readonly MediaVariant[],
    filter: CatalogFilter,
    hidden?: ReadonlySet<string>,
  ) => Promise<CatalogPage<T>>;
  /** Recherche texte croisee avec la pill de langue et les filtres TMDB. */
  searchFiltered: (
    query: string,
    lane: LaneFilter,
    order: readonly MediaVariant[],
    filter: CatalogFilter,
    limit: number,
    hidden?: ReadonlySet<string>,
  ) => Promise<T[]>;
  /** Compte dedoublonne de la vue (index si sans filtre). Appele uniquement sans filtre actif. */
  countItems: (lane: LaneFilter, filter: CatalogFilter, hidden?: ReadonlySet<string>) => Promise<number>;
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

/** Pills de langue : « Tout » = une carte par titre (VF d'abord selon la preference). */
const LANES: { id: LaneFilter; label: string; hint: string }[] = [
  { id: 'all', label: 'Tout', hint: 'Toutes les langues — une carte par titre, ta langue préférée en tête.' },
  { id: 'fr', label: 'VF', hint: 'Audio français : VF et MULTI (VF + VO au choix).' },
  { id: 'vost', label: 'VOSTFR', hint: 'Version originale sous-titrée en français.' },
  { id: 'vo', label: 'VO', hint: 'Version originale, sans sous-titres français.' },
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
 * Navigateur générique VOD/Séries « a plat » (refonte ; chantiers 1-2). Plus de
 * catégories fournisseur : pill de LANGUE (Tout / VF / VOSTFR / VO), filtres par
 * métadonnées TMDB (genres/année/note), tri global, recherche croisée. Une carte
 * par titre : les versions (VF/VOSTFR/4K…) sont regroupées, la version préférée
 * représente le titre ; la pastille de variante vient de la ligne Dexie.
 */
/**
 * Etat d'une section quittee (onglet change) : au retour, memes pages
 * chargees, meme recherche, meme position — comme la page Live. Repris
 * seulement si la vue est identique (tri, langue, filtres, catalogue).
 */
interface BrowserSnapshot {
  key: string;
  items: BrowserItem[];
  cursor: PageCursor | null;
  endReached: boolean;
  scrollY: number;
  query: string;
}
const snapshots = new Map<VodSection, BrowserSnapshot>();

export function MediaBrowser<T extends BrowserItem>({
  section,
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
  const preferredLanguage = useUiSettingsStore((s) => s.preferredLanguage);
  const regrouping = useUiSettingsStore((s) => s.regrouping);

  const hydrated = useVodFilterStore((s) => s.hydrated);
  const hydrate = useVodFilterStore((s) => s.hydrate);
  const loadGenres = useVodFilterStore((s) => s.loadGenres);
  const filters = useVodFilterStore((s) => s.filters[section]);
  const genres = useVodFilterStore((s) => s.genres[section]);
  const setSort = useVodFilterStore((s) => s.setSort);
  const setLane = useVodFilterStore((s) => s.setLane);
  const toggleGenre = useVodFilterStore((s) => s.toggleGenre);
  const clearGenres = useVodFilterStore((s) => s.clearGenres);
  const setGenreMatch = useVodFilterStore((s) => s.setGenreMatch);
  const setYearRange = useVodFilterStore((s) => s.setYearRange);
  const setMinRating = useVodFilterStore((s) => s.setMinRating);
  const resetFilters = useVodFilterStore((s) => s.resetFilters);

  const [snapshot] = useState(() => snapshots.get(section) ?? null);
  const pendingSnapshotRef = useRef(snapshot);
  const restoreScrollRef = useRef<number | null>(null);
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [endReached, setEndReached] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const [query, setQuery] = useState(() => snapshot?.query ?? '');
  // Recherche repliee en icone (deroulee si une recherche est en cours).
  const [searchOpen, setSearchOpen] = useState(() => (snapshot?.query ?? '') !== '');
  const [results, setResults] = useState<T[] | null>(null);
  const [searching, setSearching] = useState(false);
  // Echec de lecture locale (Dexie) : message + Reessayer au lieu de squelettes infinis.
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  // Recherche en echec : distinct de « aucun resultat » (et plus de squelettes sans fin).
  const [searchError, setSearchError] = useState(false);
  const [searchKey, setSearchKey] = useState(0);
  const { hydrated: catalogHydrated } = useCatalogSync();
  // Annee / note repliees derriere « Filtres (n) » : moins de rangees avant la grille.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const cursorRef = useRef<PageCursor | null>(FIRST_PAGE);
  const loadingRef = useRef(false);
  const debouncedQuery = useDebounce(query.trim(), 300);

  const order = useMemo(() => variantOrder(preferredLanguage), [preferredLanguage]);
  const active =
    filters.genreIds.length > 0 ||
    filters.minYear !== null ||
    filters.maxYear !== null ||
    filters.minRating !== null;
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
    return cf;
  }, [filters]);

  const viewKey = [
    filters.sort,
    filters.lane,
    JSON.stringify(filter),
    order.join(','),
    [...hiddenSet].sort().join(','),
    catalogSlice.lastFetchAt ?? 0,
  ].join('|');

  useEffect(() => {
    if (!hydrated) void hydrate();
  }, [hydrated, hydrate]);
  useEffect(() => {
    void loadGenres(section);
  }, [loadGenres, section]);

  // Première page à chaque changement de tri / pill / filtre / préférence
  // (et à la fin d'un re-classement des versions : les rangs ont changé).
  useEffect(() => {
    if (!hydrated || regrouping) return;
    // Retour sur l'onglet, vue identique : pages et position reprises telles quelles.
    const snap = pendingSnapshotRef.current;
    pendingSnapshotRef.current = null;
    if (snap !== null && snap.key === viewKey && snap.items.length > 0) {
      setItems(snap.items as T[]);
      cursorRef.current = snap.cursor;
      setEndReached(snap.endReached);
      setLoading(false);
      setLoadError(false);
      loadingRef.current = false;
      restoreScrollRef.current = snap.scrollY;
      return;
    }
    let alive = true;
    cursorRef.current = FIRST_PAGE;
    setItems([]);
    setEndReached(false);
    setLoading(true);
    setLoadError(false);
    loadingRef.current = false;
    fetchFlatPage(FIRST_PAGE, PAGE_SIZE, filters.sort, filters.lane, order, filter, hiddenArg)
      .then((page) => {
        if (!alive) return;
        setItems(page.items);
        cursorRef.current = page.next;
        setEndReached(page.next === null);
        setLoading(false);
        enrichVisible?.(page.items);
      })
      .catch(() => {
        if (!alive) return;
        setLoading(false);
        setLoadError(true);
      });
    return () => {
      alive = false;
    };
    // viewKey : derive des memes valeurs (+ date du catalogue : resynchro = rechargement).
  }, [hydrated, regrouping, fetchFlatPage, filters.sort, filters.lane, order, filter, hiddenArg, enrichVisible, reloadKey, viewKey]);

  // Position retrouvee une fois les pages reprises affichees.
  useEffect(() => {
    const y = restoreScrollRef.current;
    if (y === null || items.length === 0) return;
    restoreScrollRef.current = null;
    // Le routeur remet la fenetre en haut APRES ce rendu : on repasse juste apres.
    const go = () => window.scrollTo({ top: y });
    const frame = requestAnimationFrame(go);
    const timer = setTimeout(go, 150);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [items.length]);

  // Instantane au depart de la page. La position est suivie AU FIL du
  // defilement : au demontage, la navigation a deja remis la fenetre en haut.
  const latestRef = useRef({ viewKey, items, endReached, query });
  latestRef.current = { viewKey, items, endReached, query };
  useEffect(() => {
    let scrollY = window.scrollY;
    let frame: number | null = null;
    // L'URL change AVANT que le routeur ne remonte la fenetre : ce defilement-la
    // n'est pas celui de la page (sinon la position memorisee valait 0).
    const path = window.location.pathname;
    const onScroll = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        if (window.location.pathname === path) scrollY = window.scrollY;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame !== null) cancelAnimationFrame(frame);
      const l = latestRef.current;
      if (l.items.length === 0) return;
      snapshots.set(section, {
        key: l.viewKey,
        items: l.items,
        cursor: cursorRef.current,
        endReached: l.endReached,
        scrollY,
        query: l.query,
      });
    };
  }, [section]);

  // Compte total : seulement sans filtre actif (compte d'index rapide).
  useEffect(() => {
    if (!hydrated || regrouping || active || debouncedQuery.length >= 2) {
      setCount(null);
      return;
    }
    let alive = true;
    void countItems(filters.lane, {}, hiddenArg)
      .then((n) => {
        if (alive) setCount(n);
      })
      .catch(() => {
        // Compteur facultatif : la grille reste utilisable sans lui.
        if (alive) setCount(null);
      });
    return () => {
      alive = false;
    };
  }, [hydrated, regrouping, countItems, filters.lane, active, debouncedQuery, hiddenArg]);

  // Recherche indexée croisée avec la pill et les filtres.
  useEffect(() => {
    setSearchError(false);
    if (debouncedQuery.length < 2) {
      setResults(null);
      setSearching(false);
      return;
    }
    let alive = true;
    setSearching(true);
    searchFiltered(debouncedQuery, filters.lane, order, filter, SEARCH_LIMIT, hiddenArg)
      .then((r) => {
        if (!alive) return;
        setResults(r);
        enrichVisible?.(r);
      })
      .catch(() => {
        if (!alive) return;
        setResults([]);
        setSearchError(true);
      })
      .finally(() => {
        if (alive) setSearching(false);
      });
    return () => {
      alive = false;
    };
  }, [debouncedQuery, searchFiltered, filters.lane, order, filter, hiddenArg, enrichVisible, searchKey]);

  const loadMore = () => {
    const cursor = cursorRef.current;
    if (loadingRef.current || endReached || results !== null || cursor === null) return;
    loadingRef.current = true;
    setLoading(true);
    fetchFlatPage(cursor, PAGE_SIZE, filters.sort, filters.lane, order, filter, hiddenArg)
      .then((page) => {
        cursorRef.current = page.next;
        setItems((prev) => [...prev, ...page.items]);
        if (page.next === null) setEndReached(true);
        enrichVisible?.(page.items);
      })
      .catch(() => setLoadError(true))
      .finally(() => {
        loadingRef.current = false;
        setLoading(false);
      });
  };

  const shown = results ?? items;
  const sentinelRef = useLoadMore(loadMore, results === null && !endReached && items.length > 0 && !loadError, items.length);

  // Avant la relecture du catalogue local, « vide » ne veut encore rien dire.
  const catalogEmpty = catalogHydrated && catalogSlice.itemCount === 0 && catalogSlice.status !== 'loading';
  const selectClass =
    'h-11 rounded-xl border border-ink-600 bg-ink-800 px-3 text-[13px] text-fg outline-none';
  const decade = decadeValue(filters.minYear, filters.maxYear);
  const filterCount = (filters.sort !== 'recent' ? 1 : 0) + (decade !== 'all' ? 1 : 0) + (filters.minRating !== null ? 1 : 0) + filters.genreIds.length;
  const pill = (on: boolean): string =>
    `h-11 shrink-0 rounded-full px-3.5 text-[13px] font-medium transition-colors ${
      on ? 'bg-accent text-white' : 'bg-ink-800 text-fg-muted hover:text-fg'
    }`;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 xl:max-w-7xl 2xl:max-w-[1720px] 3xl:max-w-[2400px]">
      <h1 className="sr-only">{title}</h1>
      <div className="flex justify-end md:hidden">
        <BrandMark />
      </div>

      {hero}

      {/* UNE barre collante (loupe · langue · tri · filtres) : avant, ~64 % de
          l'ecran iPhone etait occupe par les controles avant la 1re affiche. */}
      <div className="sticky top-safe z-20 -mx-4 mt-3 bg-ink-950/90 px-4 py-2 backdrop-blur-md md:-mx-8 md:px-8">
        {searchOpen ? (
          <div className="relative">
            <Input
              ref={searchRef}
              type="search"
              enterKeyHint="search"
              autoFocus
              className="pr-12"
              placeholder={`Rechercher des ${itemNoun}…`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
              }}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
            <button
              type="button"
              aria-label="Fermer la recherche"
              onClick={() => {
                setQuery('');
                setResults(null); // sans attendre le delai de la recherche
                setSearchOpen(false);
              }}
              className="absolute right-0 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full text-fg-faint hover:text-fg"
            >
              <IconX className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <HScroll className="flex items-center gap-2 [scrollbar-width:none]">
            <button
              type="button"
              aria-label={`Rechercher des ${itemNoun}`}
              onClick={() => setSearchOpen(true)}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-ink-800 text-fg-muted hover:text-fg"
            >
              <IconSearch className="h-5 w-5" />
            </button>
            {/* Toujours visible (tri, annee, note, genres derriere) ; les langues defilent. */}
            <button
              type="button"
              aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen((o) => !o)}
              className={pill(filtersOpen || filterCount > 0)}
            >
              Filtres{filterCount > 0 ? ` (${filterCount})` : ''}
            </button>
            <span aria-hidden className="h-6 w-px shrink-0 bg-ink-700" />
            <div className="flex shrink-0 items-center gap-1.5" role="group" aria-label="Langue">
              {LANES.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  title={l.hint}
                  aria-pressed={filters.lane === l.id}
                  onClick={() => setLane(section, l.id)}
                  className={pill(filters.lane === l.id)}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </HScroll>
        )}
      </div>

      {/* Genres, annee, note : derriere « Filtres », ouverts a la demande. */}
      {filtersOpen && (
        <div className="mt-2 flex flex-col gap-3 rounded-2xl bg-ink-900/60 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Trier"
              value={filters.sort}
              onChange={(e) => setSort(section, e.target.value as FlatSort)}
              className={selectClass}
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>Tri : {o.label}</option>
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
            {active && (
              <button
                type="button"
                onClick={() => resetFilters(section)}
                className="h-11 rounded-full px-3 text-[13px] font-medium text-fg-faint underline-offset-2 hover:text-fg hover:underline"
              >
                Tout réinitialiser
              </button>
            )}
          </div>
          {genres.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => clearGenres(section)} className={pill(filters.genreIds.length === 0)}>
                Tous les genres
              </button>
              {genres.map((g) => {
                const on = filters.genreIds.includes(g.id);
                return (
                  <button key={g.id} type="button" aria-pressed={on} onClick={() => toggleGenre(section, g.id)} className={pill(on)}>
                    {g.name}
                  </button>
                );
              })}
            </div>
          )}
          {filters.genreIds.length > 1 && (
            <button
              type="button"
              onClick={() => setGenreMatch(section, filters.genreMatch === 'all' ? 'any' : 'all')}
              aria-pressed={filters.genreMatch === 'all'}
              className={cn(pill(filters.genreMatch === 'all'), 'self-start')}
            >
              {filters.genreMatch === 'all' ? 'Tous ces genres à la fois' : 'Au moins un de ces genres'}
            </button>
          )}
        </div>
      )}

      {/* Compteur */}
      {regrouping ? (
        <p className="mt-3 text-xs text-fg-faint">Réorganisation des versions selon ta langue préférée…</p>
      ) : results !== null ? (
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
            hint="Récupère les films et séries de ton serveur pour commencer."
            action={<SyncCatalogButton />}
          />
        </div>
      ) : loadError && items.length === 0 ? (
        <div className="mt-6">
          <ErrorState title="Impossible d'afficher le catalogue" onRetry={() => setReloadKey((k) => k + 1)} />
        </div>
      ) : searchError ? (
        <div className="mt-6">
          <ErrorState title="La recherche n’a pas abouti" onRetry={() => setSearchKey((k) => k + 1)} />
        </div>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 3xl:grid-cols-10">
            {shown.map((item) => (
              <MediaCard
                key={item.id}
                href={hrefFor(item)}
                title={displayTitle(item.name)}
                posterUrl={item.posterUrl}
                subtitle={subtitleFor?.(item) ?? undefined}
                quality={mediaBadges(item.name, null).find((b) => b.tone === 'quality')?.label ?? null}
                rating={item.ratingSort > 0 ? item.ratingSort : null}
                tag={variantBadge(item.variant, item.variantSource)}
              />
            ))}
            {(loading || searching || regrouping) &&
              shown.length === 0 &&
              Array.from({ length: 12 }, (_, i) => <Skeleton key={i} className="aspect-[2/3] rounded-xl" />)}
          </div>

          {results !== null && results.length === 0 && !searching && (
            <div className="mt-6">
              <EmptyState title="Aucun résultat" hint="Essaie un autre titre, une autre langue ou ajuste les filtres." />
            </div>
          )}
          {results === null && !loading && !regrouping && shown.length === 0 && (
            <div className="mt-6">
              <EmptyState
                title={active || filters.lane !== 'all' ? 'Aucun contenu pour cette sélection' : 'Catalogue vide'}
                hint={active || filters.lane !== 'all' ? 'Élargis la langue ou réinitialise les filtres.' : undefined}
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
