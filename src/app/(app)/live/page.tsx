'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChannelLogo } from '@/components/shared/ChannelLogo';
import { EmptyState } from '@/components/shared/EmptyState';
import { FavoriteButton } from '@/components/shared/FavoriteButton';
import { HScroll } from '@/components/shared/HScroll';
import { IconChevronDown, IconEyeOff, IconSearch } from '@/components/ui/icons';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';
import * as catalogRepository from '@/db/repositories/catalogRepository';
import type { LiveFilter } from '@/db/repositories/catalogRepository';
import { groupChannels } from '@/services/live/channelGroupingService';
import { isSeparatorOrEvent } from '@/services/live/channelNormalizer';
import type { ChannelGroup } from '@/types/liveGrouping';
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

/**
 * Vues FR bornees ou l'on REGROUPE les doublons (TF1 HD/FHD/4K -> une entree
 * "TF1"). International/Tous restent "en vrac" (individuels), et la recherche
 * garde chaque resultat distinct.
 */
const GROUPED_FILTERS: FilterId[] = [
  'france', 'main', 'sport', 'foot', 'news', 'cinema', 'entertainment', 'kids', 'doc', 'music', 'uhd',
];

/** Sections editoriales du bouquet FR (vue par defaut "France"). */
type SectionKey = 'main' | 'news' | 'sport' | 'cinema' | 'entertainment' | 'kids' | 'doc' | 'music' | 'other';

const SECTION_META: { key: SectionKey; label: string; seeAll?: FilterId }[] = [
  { key: 'main', label: 'Chaînes principales', seeAll: 'main' },
  { key: 'news', label: 'Info', seeAll: 'news' },
  { key: 'sport', label: 'Sport', seeAll: 'sport' },
  { key: 'cinema', label: 'Cinéma & séries', seeAll: 'cinema' },
  { key: 'entertainment', label: 'Divertissement', seeAll: 'entertainment' },
  { key: 'kids', label: 'Enfants', seeAll: 'kids' },
  { key: 'doc', label: 'Documentaires', seeAll: 'doc' },
  { key: 'music', label: 'Musique', seeAll: 'music' },
  { key: 'other', label: 'Autres chaînes FR' },
];

const SECTION_CAP = 12;

function sectionOf(group: ChannelGroup): SectionKey {
  if (isMainFrenchChannel(group.best)) return 'main';
  const theme = group.best.theme;
  if (
    theme === 'news' ||
    theme === 'sport' ||
    theme === 'cinema' ||
    theme === 'entertainment' ||
    theme === 'kids' ||
    theme === 'doc' ||
    theme === 'music'
  ) {
    return theme;
  }
  return 'other';
}

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

/** Ligne groupee : une chaine logique + selecteur de versions (si doublons). */
function ChannelGroupRow({ group, onHide }: { group: ChannelGroup; onHide: () => void }) {
  const [open, setOpen] = useState(false);
  const best = group.best;
  const bestLabel = group.versions[0]?.label ?? 'Standard';
  const multi = group.versions.length > 1;
  return (
    <div className="rounded-xl transition-colors hover:bg-ink-800">
      <div className="group flex items-center gap-2 px-2 py-2">
        <Link href={`/live/${best.id}`} className="flex min-w-0 flex-1 items-center gap-3">
          <ChannelLogo channel={best} className="h-11 w-11 shrink-0" />
          <span className="min-w-0 flex-1 truncate text-sm text-fg">{displayChannelName(group.name)}</span>
          {group.isFrench === 1 && (
            <span className="rounded bg-accent/15 px-1 py-0.5 text-[10px] font-semibold text-accent">FR</span>
          )}
          {group.versions[0]?.quality !== 'STANDARD' && (
            <span className="rounded bg-ink-600 px-1.5 py-0.5 text-[10px] font-semibold text-fg-muted">{bestLabel}</span>
          )}
        </Link>
        {multi && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-label={`${group.versions.length} versions disponibles`}
            className="flex shrink-0 items-center gap-1 rounded-full bg-ink-700 px-2.5 py-1 text-[11px] font-medium text-fg-muted hover:text-fg"
          >
            {group.versions.length}
            <IconChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
          </button>
        )}
        <button
          aria-label="Masquer la catégorie de cette chaîne"
          title="Masquer la catégorie"
          onClick={onHide}
          className="shrink-0 rounded p-2 text-fg-faint transition-opacity hover:text-accent md:opacity-0 md:group-hover:opacity-100"
        >
          <IconEyeOff className="h-4 w-4" />
        </button>
        <FavoriteButton type="live" itemId={best.id} />
      </div>
      {open && multi && (
        <div className="flex flex-wrap gap-2 px-3 pb-3 pt-0.5">
          {group.versions.map((version) => (
            <Link
              key={version.channel.id}
              href={`/live/${version.channel.id}`}
              className="rounded-lg bg-ink-700 px-3 py-1.5 text-xs font-medium text-fg-muted transition-colors hover:bg-ink-600 hover:text-fg"
            >
              {version.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

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
        // Exclusion des categories masquees AVANT la limite (cote repository).
        const res = await catalogRepository.searchLiveChannels(debouncedQuery, 120, hidden);
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
  }, [filter, searching, debouncedQuery, favLiveIds, recentChannels, notHidden, hidden]);

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

  // Groupement des doublons sur les vues FR bornees (pool entierement charge).
  const recentIdSet = useMemo(() => new Set(recentChannels.map((e) => e.itemId)), [recentChannels]);
  const grouped = !searching && GROUPED_FILTERS.includes(filter);
  const groups = useMemo(
    () =>
      grouped
        ? groupChannels(pool.filter((c) => !isSeparatorOrEvent(c.name)), {
            favoriteIds: favLiveIds,
            recentIds: recentIdSet,
          })
        : [],
    [grouped, pool, favLiveIds, recentIdSet],
  );
  const total = grouped ? groups.length : pool.length;

  // Bouquet editorial : la vue "France" par defaut s'organise en sections.
  const bouquet = filter === 'france' && !searching;
  const bySection = useMemo(() => {
    if (!bouquet) return null;
    const map = new Map<SectionKey, ChannelGroup[]>();
    for (const group of groups) {
      const key = sectionOf(group);
      const arr = map.get(key);
      if (arr !== undefined) arr.push(group);
      else map.set(key, [group]);
    }
    return map;
  }, [bouquet, groups]);

  const canLoadMore =
    visible < total || (PAGINATED.includes(filter) && !searching && !exhaustedRef.current);
  const sentinelRef = useLoadMore(loadMore, canLoadMore && !loading);

  const shown = pool.slice(0, visible);
  const shownGroups = groups.slice(0, visible);
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

      {/* Filtres rapides — entree principale, faciles a toucher sur iPhone.
          Colles en haut (sticky) en verre depoli au scroll. */}
      <HScroll className="glass sticky top-0 z-30 -mx-4 mt-3 flex gap-2 px-4 py-2 [scrollbar-width:none] md:-mx-8 md:px-8">
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
      </HScroll>

      {count !== null && (
        <p className="mt-3 text-xs text-fg-faint">
          {searching
            ? `${pool.length}${pool.length >= 120 ? '+' : ''} résultat${pool.length > 1 ? 's' : ''}`
            : grouped
              ? `${formatCount(groups.length)} chaîne${groups.length > 1 ? 's' : ''} · ${formatCount(pool.length)} flux${capped ? ' · affine avec la recherche' : ''}`
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
      ) : bouquet ? (
        <div className="mt-4 space-y-8">
          {loading && groups.length === 0
            ? Array.from({ length: 10 }, (_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)
            : SECTION_META.map(({ key, label, seeAll }) => {
                const sec = bySection?.get(key) ?? [];
                if (sec.length === 0) return null;
                return (
                  <section key={key}>
                    <div className="mb-2 flex items-center justify-between px-1">
                      <h2 className="text-sm font-semibold text-fg">
                        {label} <span className="text-fg-faint">· {sec.length}</span>
                      </h2>
                      {seeAll !== undefined && sec.length > SECTION_CAP && (
                        <button
                          type="button"
                          onClick={() => {
                            setFilter(seeAll);
                            setQuery('');
                            void settingsRepository.setSetting('lastLiveFilter', seeAll);
                          }}
                          className="text-xs text-fg-faint hover:text-fg"
                        >
                          Voir tout
                        </button>
                      )}
                    </div>
                    <div className="flex flex-col sm:grid sm:grid-cols-2 sm:gap-x-4">
                      {sec.slice(0, SECTION_CAP).map((g) => (
                        <ChannelGroupRow
                          key={g.key}
                          group={g}
                          onHide={() =>
                            void hideCategory('live', g.best.categoryId, categoryOf.get(g.best.categoryId) ?? g.name)
                          }
                        />
                      ))}
                    </div>
                  </section>
                );
              })}
          {!loading && groups.length === 0 && <EmptyState title="Aucune chaîne française" />}
        </div>
      ) : (
        <div className="mt-3">
          <div className="flex flex-col sm:grid sm:grid-cols-2 sm:gap-x-4">
            {loading && (grouped ? shownGroups.length : shown.length) === 0
              ? Array.from({ length: 12 }, (_, i) => <Skeleton key={i} className="mb-2 h-14 rounded-xl" />)
              : grouped
                ? shownGroups.map((g) => (
                    <ChannelGroupRow
                      key={g.key}
                      group={g}
                      onHide={() =>
                        void hideCategory('live', g.best.categoryId, categoryOf.get(g.best.categoryId) ?? g.name)
                      }
                    />
                  ))
                : shown.map((c) => (
                    <ChannelRow
                      key={c.id}
                      channel={c}
                      onHide={() => void hideCategory('live', c.categoryId, categoryOf.get(c.categoryId) ?? c.name)}
                    />
                  ))}
          </div>

          {!loading && (grouped ? shownGroups.length : shown.length) === 0 && (
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
