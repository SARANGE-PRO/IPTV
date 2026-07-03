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
import { useDebounce } from '@/hooks/useDebounce';
import { useLoadMore } from '@/hooks/useLoadMore';
import { useCatalogStore } from '@/stores/catalogStore';
import { useFavoritesStore } from '@/stores/favoritesStore';
import { useFilterStore } from '@/stores/filterStore';
import { usePlaybackStore } from '@/stores/playbackStore';
import type { LiveChannel } from '@/types/models';
import type { ChannelTheme } from '@/utils/channelTheme';
import { formatCount } from '@/utils/format';

/** Filtres rapides — remplacent la navigation rigide par categorie fournisseur. */
type QuickFilter =
  | { id: 'france'; label: 'France' }
  | { id: 'favorites'; label: 'Favoris' }
  | { id: 'recent'; label: 'Récents' }
  | { id: 'uhd'; label: '4K/UHD' }
  | { id: 'all'; label: 'Tous' }
  | { id: ChannelTheme; label: string };

const FILTERS: QuickFilter[] = [
  { id: 'france', label: 'France' },
  { id: 'favorites', label: 'Favoris' },
  { id: 'recent', label: 'Récents' },
  { id: 'sport', label: 'Sport' },
  { id: 'news', label: 'News' },
  { id: 'cinema', label: 'Cinéma' },
  { id: 'entertainment', label: 'Divertissement' },
  { id: 'kids', label: 'Enfants' },
  { id: 'music', label: 'Musique' },
  { id: 'doc', label: 'Doc' },
  { id: 'uhd', label: '4K/UHD' },
  { id: 'all', label: 'Tous' },
];

const STEP = 60;
const PAGE = 200;
const CAP = 4000; // filtres bornes : jamais les 55k en memoire

type FilterId = QuickFilter['id'];

function toRepoFilter(id: FilterId): LiveFilter {
  if (id === 'france') return { kind: 'french' };
  if (id === 'uhd') return { kind: 'uhd' };
  if (id === 'all') return { kind: 'all' };
  return { kind: 'theme', theme: id as ChannelTheme };
}

/** FR d'abord, puis ordre fournisseur. */
function orderChannels(list: LiveChannel[]): LiveChannel[] {
  return [...list].sort((a, b) => b.isFrench - a.isFrench || a.sortOrder - b.sortOrder);
}

function ChannelRow({ channel, onHide }: { channel: LiveChannel; onHide: () => void }) {
  return (
    <div className="group flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-ink-800">
      <Link href={`/live/${channel.id}`} className="flex min-w-0 flex-1 items-center gap-3">
        <ChannelLogo channel={channel} className="h-11 w-11 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-sm text-fg">{channel.name}</span>
        {channel.isFrench === 1 && (
          <span className="rounded bg-accent/15 px-1 py-0.5 text-[10px] font-semibold text-accent">FR</span>
        )}
      </Link>
      <button
        aria-label="Masquer la catégorie de cette chaîne"
        title="Masquer la catégorie"
        onClick={onHide}
        className="shrink-0 rounded p-1.5 text-fg-faint opacity-0 hover:text-accent group-hover:opacity-100"
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
      // 'all' : pagination Dexie (jamais tout en memoire).
      if (filter === 'all') {
        const first = (await catalogRepository.getLiveChannelsPage({ kind: 'all' }, 0, PAGE)).filter(notHidden);
        offsetRef.current = PAGE;
        exhaustedRef.current = first.length < PAGE;
        void catalogRepository.countLiveChannels({ kind: 'all' }).then((n) => active && setCount(n));
        if (active) setPool(orderChannels(first));
        return;
      }
      // Filtres bornes (france / theme / uhd) : charge jusqu'a CAP puis tri FR-first.
      const repoFilter = toRepoFilter(filter);
      const loaded = (await catalogRepository.getLiveChannelsPage(repoFilter, 0, CAP)).filter(notHidden);
      void catalogRepository.countLiveChannels(repoFilter).then((n) => active && setCount(n));
      if (active) {
        setPool(orderChannels(loaded));
        setCapped(loaded.length >= CAP);
      }
    };

    void run().finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [filter, searching, debouncedQuery, favLiveIds, recentChannels, notHidden]);

  // Charge plus : fenetre (pool) + pagination Dexie pour 'all'.
  const loadMore = useCallback(() => {
    if (loadingRef.current) return;
    const needMorePool = !searching && filter === 'all' && visible >= pool.length && !exhaustedRef.current;
    if (needMorePool) {
      loadingRef.current = true;
      void catalogRepository
        .getLiveChannelsPage({ kind: 'all' }, offsetRef.current, PAGE)
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

  const canLoadMore = visible < pool.length || (filter === 'all' && !searching && !exhaustedRef.current);
  const sentinelRef = useLoadMore(loadMore, canLoadMore && !loading);

  const shown = pool.slice(0, visible);
  const catalogEmpty = categories.length === 0 && slice.status !== 'loading';

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-6 md:px-8">
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

      {/* Filtres rapides */}
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => {
              setFilter(f.id);
              setQuery('');
            }}
            disabled={searching}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
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
        <div className="mt-3 flex flex-col">
          {loading && shown.length === 0
            ? Array.from({ length: 10 }, (_, i) => <Skeleton key={i} className="mb-2 h-14 rounded-xl" />)
            : shown.map((c) => (
                <ChannelRow
                  key={c.id}
                  channel={c}
                  onHide={() => void hideCategory('live', c.categoryId, categoryOf.get(c.categoryId) ?? c.name)}
                />
              ))}

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
