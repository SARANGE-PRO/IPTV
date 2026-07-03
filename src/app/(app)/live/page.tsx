'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChannelLogo } from '@/components/shared/ChannelLogo';
import { EmptyState } from '@/components/shared/EmptyState';
import { FavoriteButton } from '@/components/shared/FavoriteButton';
import { IconEyeOff, IconSearch } from '@/components/ui/icons';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import * as catalogRepository from '@/db/repositories/catalogRepository';
import type { LiveFilter } from '@/db/repositories/catalogRepository';
import * as settingsRepository from '@/db/repositories/settingsRepository';
import { useDebounce } from '@/hooks/useDebounce';
import { useLoadMore } from '@/hooks/useLoadMore';
import { useCatalogStore } from '@/stores/catalogStore';
import { useFavoritesStore } from '@/stores/favoritesStore';
import { useFilterStore } from '@/stores/filterStore';
import { usePlaybackStore } from '@/stores/playbackStore';
import type { LiveChannel } from '@/types/models';
import type { ChannelTheme } from '@/utils/channelTheme';
import { compareLiveChannels, isFootballChannel, isMainFrenchChannel } from '@/utils/channelPriority';
import { displayChannelName } from '@/utils/displayTitle';
import { formatCount } from '@/utils/format';

/**
 * Filtres rapides Live — l'entree principale (remplace la navigation rigide par
 * categorie fournisseur). France prioritaire par defaut ; les autres pays
 * restent accessibles via "International" sans polluer l'experience.
 */
type FilterId =
  | 'france'
  | 'main'
  | 'favorites'
  | 'recent'
  | 'sport'
  | 'foot'
  | 'news'
  | 'cinema'
  | 'entertainment'
  | 'kids'
  | 'doc'
  | 'music'
  | 'uhd'
  | 'international'
  | 'all';

const FILTERS: { id: FilterId; label: string }[] = [
  { id: 'france', label: 'France' },
  { id: 'main', label: 'Principales' },
  { id: 'favorites', label: 'Favoris' },
  { id: 'recent', label: 'Récents' },
  { id: 'sport', label: 'Sport' },
  { id: 'foot', label: 'Foot' },
  { id: 'news', label: 'News' },
  { id: 'cinema', label: 'Cinéma' },
  { id: 'entertainment', label: 'Divertissement' },
  { id: 'kids', label: 'Enfants' },
  { id: 'doc', label: 'Doc' },
  { id: 'music', label: 'Musique' },
  { id: 'uhd', label: '4K/UHD' },
  { id: 'international', label: 'International' },
  { id: 'all', label: 'Tous' },
];

const STEP = 60;
const PAGE = 200;
const CAP = 4000; // filtres bornes : jamais les 55k en memoire

/** Filtres servis par pagination Dexie (jamais tout le catalogue en RAM). */
const PAGINATED: FilterId[] = ['all', 'international'];

function paginatedFilter(id: FilterId): LiveFilter {
  return id === 'international' ? { kind: 'nonFrench' } : { kind: 'all' };
}

/** Filtre "borne" : on charge jusqu'a CAP puis on trie/affine cote client. */
function boundedBaseFilter(id: FilterId): LiveFilter {
  if (id === 'france' || id === 'main') return { kind: 'french' };
  if (id === 'uhd') return { kind: 'uhd' };
  if (id === 'foot') return { kind: 'frenchTheme', theme: 'sport' };
  return { kind: 'frenchTheme', theme: id as ChannelTheme };
}

function boundedPredicate(id: FilterId): (channel: LiveChannel) => boolean {
  if (id === 'main') return isMainFrenchChannel;
  if (id === 'foot') return isFootballChannel;
  return () => true;
}

/** Tri intelligent : principales FR -> FR par theme -> reste -> ordre fournisseur. */
const orderChannels = (list: LiveChannel[]): LiveChannel[] => [...list].sort(compareLiveChannels);

function ChannelRow({ channel, onHide }: { channel: LiveChannel; onHide: () => void }) {
  return (
    <div className="group flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-ink-800">
      <Link href={`/live/${channel.id}`} className="flex min-w-0 flex-1 items-center gap-3">
        <ChannelLogo channel={channel} className="h-11 w-11 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-sm text-fg">{displayChannelName(channel.name)}</span>
        {channel.isFrench === 1 && (
          <span className="rounded bg-accent/15 px-1 py-0.5 text-[10px] font-semibold text-accent">FR</span>
        )}
      </Link>
      <button
        aria-label="Masquer la catégorie de cette chaîne"
        title="Masquer la catégorie"
        onClick={onHide}
        className="shrink-0 rounded p-2 text-fg-faint transition-opacity hover:text-accent md:opacity-0 md:group-hover:opacity-100"
      >
        <IconEyeOff className="h-4 w-4" />
      </button>
      <FavoriteButton type="live" itemId={channel.id} />
    </div>
  );
}

export default function LivePage() {
  const slice = useCatalogStore((s) => s.sections.live);
  const categories = slice.categories;
  const hidden = useFilterStore((s) => s.hidden.live);
  const hideCategory = useFilterStore((s) => s.hideCategory);
  const favLiveIds = useFavoritesStore((s) => s.ids.live);
  const recentChannels = usePlaybackStore((s) => s.recentChannels);

  const [filter, setFilter] = useState<FilterId>('france');
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query.trim(), 300);
  const searching = debouncedQuery.length >= 2;

  const [pool, setPool] = useState<LiveChannel[]>([]);
  const [visible, setVisible] = useState(STEP);
  const [loading, setLoading] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const [capped, setCapped] = useState(false);
  const exhaustedRef = useRef(false);
  const offsetRef = useRef(0);
  const loadingRef = useRef(false);

  const categoryOf = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);
  const notHidden = useCallback((c: LiveChannel) => !hidden.has(c.categoryId), [hidden]);

  useEffect(() => {
    let active = true;
    void settingsRepository.getSetting<string>('lastLiveFilter').then((saved) => {
      if (active && saved !== undefined && FILTERS.some((item) => item.id === saved)) {
        setFilter(saved as FilterId);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  // Chargement du pool selon filtre / recherche.
  useEffect(() => {
    let active = true;
    setLoading(true);
    setVisible(STEP);
    setCapped(false);
    setCount(null);
    offsetRef.current = 0;
    exhaustedRef.current = false;

    const run = async () => {
      // Recherche : index multiEntry, tous filtres confondus.
      if (searching) {
        const res = (await catalogRepository.searchLiveChannels(debouncedQuery, 120)).filter(notHidden);
        if (active) {
          setPool(res);
          setCount(res.length);
        }
        return;
      }
      // Favoris : depuis le store (petit ensemble).
      if (filter === 'favorites') {
        const res = orderChannels((await catalogRepository.getLiveChannelsByIds([...favLiveIds])).filter(notHidden));
        if (active) {
          setPool(res);
          setCount(res.length);
        }
        return;
      }
      // Recents : ordre de visionnage conserve.
      if (filter === 'recent') {
        const ids = recentChannels.map((e) => e.itemId);
        const byId = new Map((await catalogRepository.getLiveChannelsByIds(ids)).map((c) => [c.id, c]));
        const res = ids.map((id) => byId.get(id)).filter((c): c is LiveChannel => c !== undefined).filter(notHidden);
        if (active) {
          setPool(res);
          setCount(res.length);
        }
        return;
      }
      // Filtres pagines (Tous / International) : pagination Dexie, jamais tout en RAM.
      if (PAGINATED.includes(filter)) {
        const repoFilter = paginatedFilter(filter);
        const first = (await catalogRepository.getLiveChannelsPage(repoFilter, 0, PAGE)).filter(notHidden);
        offsetRef.current = PAGE;
        exhaustedRef.current = first.length < PAGE;
        void catalogRepository.countLiveChannels(repoFilter).then((n) => active && setCount(n));
        if (active) setPool(orderChannels(first));
        return;
      }
      // Filtres bornes (france / principales / theme / foot / uhd) : charge jusqu'a
      // CAP, affine cote client puis tri intelligent.
      const repoFilter = boundedBaseFilter(filter);
      const predicate = boundedPredicate(filter);
      const raw = await catalogRepository.getLiveChannelsPage(repoFilter, 0, CAP);
      const loaded = raw.filter(notHidden).filter(predicate);
      if (active) {
        setPool(orderChannels(loaded));
        setCount(loaded.length);
        setCapped(raw.length >= CAP);
      }
    };

    void run().finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [filter, searching, debouncedQuery, favLiveIds, recentChannels, notHidden]);

  // Charge plus : fenetre (pool) + pagination Dexie pour les filtres pagines.
  const loadMore = useCallback(() => {
    if (loadingRef.current) return;
    const paginated = !searching && PAGINATED.includes(filter);
    const needMorePool = paginated && visible >= pool.length && !exhaustedRef.current;
    if (needMorePool) {
      loadingRef.current = true;
      void catalogRepository
        .getLiveChannelsPage(paginatedFilter(filter), offsetRef.current, PAGE)
        .then((page) => {
          const kept = page.filter(notHidden);
          offsetRef.current += PAGE;
          exhaustedRef.current = page.length < PAGE;
          setPool((prev) => [...prev, ...kept]);
          setVisible((v) => v + STEP);
          loadingRef.current = false;
        });
      return;
    }
    if (visible < pool.length) setVisible((v) => v + STEP);
  }, [searching, filter, visible, pool.length, notHidden]);

  const canLoadMore =
    visible < pool.length || (PAGINATED.includes(filter) && !searching && !exhaustedRef.current);
  const sentinelRef = useLoadMore(loadMore, canLoadMore && !loading);

  const shown = pool.slice(0, visible);
  const catalogEmpty = categories.length === 0 && slice.status !== 'loading';

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6 md:px-8">
      <h1 className="text-2xl font-semibold tracking-tight text-fg">Live TV</h1>

      <div className="mt-4">
        <div className="relative">
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-fg-faint" />
          <Input
            className="pl-10"
            placeholder="Rechercher une chaîne…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            inputMode="search"
          />
        </div>
      </div>

      {/* Filtres rapides — entree principale, faciles a toucher sur iPhone. */}
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => {
              setFilter(f.id);
              setQuery('');
              void settingsRepository.setSetting('lastLiveFilter', f.id);
            }}
            disabled={searching}
            className={`shrink-0 rounded-full px-4 py-2 text-[13px] font-medium transition-colors ${
              !searching && filter === f.id
                ? 'bg-accent text-white'
                : 'bg-ink-800 text-fg-muted hover:text-fg disabled:opacity-40'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {count !== null && (
        <p className="mt-3 text-xs text-fg-faint">
          {searching
            ? `${pool.length}${pool.length >= 120 ? '+' : ''} résultat${pool.length > 1 ? 's' : ''}`
            : `${formatCount(count)} chaîne${count > 1 ? 's' : ''}${capped ? ' · affine avec la recherche' : ''}`}
        </p>
      )}

      {catalogEmpty ? (
        <div className="mt-6">
          <EmptyState
            title="Catalogue non synchronisé"
            hint="Lance une synchronisation depuis les réglages pour charger les chaînes."
          />
        </div>
      ) : (
        <div className="mt-3">
          <div className="flex flex-col sm:grid sm:grid-cols-2 sm:gap-x-4 lg:grid-cols-3">
            {loading && shown.length === 0
              ? Array.from({ length: 12 }, (_, i) => <Skeleton key={i} className="mb-2 h-14 rounded-xl" />)
              : shown.map((c) => (
                  <ChannelRow
                    key={c.id}
                    channel={c}
                    onHide={() => void hideCategory('live', c.categoryId, categoryOf.get(c.categoryId) ?? c.name)}
                  />
                ))}
          </div>

          {!loading && shown.length === 0 && (
            <div className="mt-4">
              <EmptyState
                title={searching ? 'Aucune chaîne trouvée' : 'Aucune chaîne dans ce filtre'}
                hint={filter === 'favorites' ? 'Ajoute des favoris avec le cœur.' : undefined}
              />
            </div>
          )}
          <div ref={sentinelRef} className="h-10" />
        </div>
      )}
    </main>
  );
}
