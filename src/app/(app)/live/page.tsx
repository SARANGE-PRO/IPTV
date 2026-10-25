'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TabNameDialog } from '@/components/favorites/TabNameDialog';
import { LiveChannelRow, type LiveRowData } from '@/components/live/LiveChannelRow';
import { LiveViewBar } from '@/components/live/LiveViewBar';
import { RecentChannelsStrip } from '@/components/live/RecentChannelsStrip';
import { BrandMark } from '@/components/shared/BrandMark';
import { EmptyState } from '@/components/shared/EmptyState';
import { ErrorState } from '@/components/shared/ErrorState';
import { SyncCatalogButton } from '@/components/shared/SyncCatalogButton';
import { IconChevronRight } from '@/components/ui/actionIcons';
import { IconSearch, IconX } from '@/components/ui/icons';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { useCatalogSync } from '@/hooks/useCatalogSync';
import { useDebounce } from '@/hooks/useDebounce';
import { useFavoriteItems } from '@/hooks/useFavoriteItems';
import { useLiveCatalogPage } from '@/hooks/useLiveCatalogPage';
import { useLiveLineup } from '@/hooks/useLiveLineup';
import { LIVE_SEARCH_LIMIT, useLiveSearch } from '@/hooks/useLiveSearch';
import { useTvNow } from '@/hooks/useTvNow';
import { useVersionRanking } from '@/hooks/useVersionRanking';
import { useLoadMore } from '@/hooks/useLoadMore';
import type { LiveFilter } from '@/services/data/catalogService';
import * as settingsRepository from '@/services/data/settingsDataService';
import type { FavoriteChannel } from '@/services/favorites/favoriteItemsService';
import {
  buildOverview,
  filterLineup,
  isLineupView,
  restoreView,
  tabIdOf,
  viewLabel,
  withoutHidden,
  type LiveViewId,
  type OverviewItem,
} from '@/services/live/liveViews';
import { setZapContext } from '@/services/live/liveZappingService';
import { useCatalogStore } from '@/stores/catalogStore';
import { useFavoritesStore } from '@/stores/favoritesStore';
import { useFilterStore } from '@/stores/filterStore';
import { useLiveUiStore } from '@/stores/liveUiStore';
import { usePlaybackStore } from '@/stores/playbackStore';
import type { LineupGroup } from '@/types/liveLineup';
import type { LiveChannel } from '@/types/models';
import type { TvNow } from '@/types/tvGuide';
import { rankVersionLogos } from '@/utils/channelLogos';
import { displayChannelName } from '@/utils/displayTitle';
import { formatCount } from '@/utils/format';

/**
 * Live TV. Vue France par defaut = grille FR rangee (TNT dans l'ordre des
 * numeros, Canal+, Sport, Info… puis Francophonie), une ligne par chaine avec
 * ses versions. Favoris et onglets perso a cote ; International / Tous en
 * pagination Dexie. Les 10 dernieres chaines regardees restent a un tap.
 */

const STEP = 80;
const LIVE_ONLY = ['live'] as const;
const SETTING_KEY = 'lastLiveFilter';

/** Programme en cours d'une chaine de la grille (chaines FR, nom du referentiel). */
type NowFor = (name: string) => TvNow | null;
/** Ordre des versions (fiabilite apprise + reseau), voir useVersionRanking. */
type Rank = (versions: readonly LineupGroup['versions'][number][]) => LineupGroup['versions'];
const nowOf = (group: LineupGroup | undefined, nowFor: NowFor): TvNow | null =>
  group !== undefined && group.country === null ? nowFor(group.name) : null;

function groupRow(group: LineupGroup, categoryName: Map<string, string>, nowFor: NowFor, rank: Rank): LiveRowData {
  // Tap = version qui a marche la derniere fois (sinon la meilleure qualite).
  const ordered = rank(group.versions);
  const best = ordered[0]!;
  const [logoUrl = null, ...logoAlternates] = rankVersionLogos(group.versions);
  const badges: string[] = [];
  if (best.quality !== 'STANDARD') badges.push(best.qualityLabel);
  if (group.country !== null) badges.push(group.country);
  return {
    id: best.id,
    name: group.name,
    logoUrl,
    logoAlternates,
    isFrench: group.country === null,
    now: nowOf(group, nowFor),
    lcn: group.lcn,
    badges,
    versions: ordered.map((v) => ({ id: v.id, label: v.qualityLabel })),
    categoryId: best.categoryId,
    categoryName: categoryName.get(best.categoryId),
  };
}

function favoriteRow(
  channel: FavoriteChannel,
  categoryName: Map<string, string>,
  group: LineupGroup | undefined,
  nowFor: NowFor,
  rank: Rank,
): LiveRowData {
  return {
    now: nowOf(group, nowFor),
    // Versions de la chaine (si elle est dans la grille FR), comme dans la grille.
    versions:
      group !== undefined && group.versions.length > 1
        ? rank(group.versions).map((v) => ({ id: v.id, label: v.qualityLabel }))
        : undefined,
    id: channel.id,
    name: channel.name,
    logoUrl: channel.logoUrl,
    logoAlternates: channel.logoAlternates,
    isFrench: channel.isFrench === 1,
    lcn: channel.lcn,
    badges: channel.qualityLabel !== null ? [channel.qualityLabel] : [],
    categoryId: channel.categoryId,
    categoryName: categoryName.get(channel.categoryId),
  };
}

function channelRow(channel: LiveChannel, categoryName: Map<string, string>): LiveRowData {
  return {
    id: channel.id,
    name: displayChannelName(channel.name),
    logoUrl: channel.logoUrl,
    badges: channel.isFrench === 1 ? ['FR'] : [],
    categoryId: channel.categoryId,
    categoryName: categoryName.get(channel.categoryId),
  };
}

type ListItem = { kind: 'header'; header: Extract<OverviewItem, { kind: 'header' }> } | { kind: 'row'; row: LiveRowData };

export default function LivePage() {
  const slice = useCatalogStore((s) => s.sections.live);
  const hidden = useFilterStore((s) => s.hidden.live);
  const tabs = useFavoritesStore((s) => s.tabs);
  const favoritesHydrated = useFavoritesStore((s) => s.hydrated);
  const createTab = useFavoritesStore((s) => s.createTab);
  const recentChannels = usePlaybackStore((s) => s.recentChannels);
  const { hydrated: catalogHydrated } = useCatalogSync();

  // Retour d'une chaine : meme vue, meme recherche, meme position (store de
  // session) ; premier affichage : vue memorisee dans les reglages.
  const [initialUi] = useState(() => useLiveUiStore.getState());
  const [view, setView] = useState<LiveViewId>(initialUi.view ?? 'france');
  const [query, setQuery] = useState(initialUi.query);
  const [creatingTab, setCreatingTab] = useState(false);
  const [visible, setVisible] = useState(Math.max(STEP, initialUi.visible));
  const debouncedQuery = useDebounce(query.trim(), 300);
  const search = useLiveSearch(debouncedQuery, hidden);
  const searchRef = useRef<HTMLInputElement | null>(null);

  // Vue memorisee : restauree une fois les onglets connus.
  const restoredRef = useRef(initialUi.view !== null);
  useEffect(() => {
    if (!favoritesHydrated || restoredRef.current) return;
    restoredRef.current = true;
    const tabIds = useFavoritesStore.getState().tabs.map((t) => t.id);
    void settingsRepository
      .getSetting<string>(SETTING_KEY)
      .then((saved) => setView(restoreView(saved, tabIds)))
      .catch(() => undefined);
  }, [favoritesHydrated]);

  // Onglet supprime pendant qu'il est affiche : retour aux favoris.
  const currentTabId = tabIdOf(view);
  useEffect(() => {
    if (currentTabId !== null && favoritesHydrated && !tabs.some((t) => t.id === currentTabId)) setView('favorites');
  }, [currentTabId, tabs, favoritesHydrated]);

  // Nouvelle vue / recherche : on repart du debut (pas au tout 1er rendu, qui
  // peut restaurer une liste deja deroulee).
  const firstRenderRef = useRef(true);
  useEffect(() => {
    if (firstRenderRef.current) {
      firstRenderRef.current = false;
      return;
    }
    setVisible(STEP);
  }, [view, debouncedQuery]);

  // Etat conserve pour le retour. La position est suivie AU FIL du defilement :
  // au demontage, la navigation a deja remis la fenetre en haut.
  const uiRef = useRef({ view, query, visible });
  uiRef.current = { view, query, visible };
  const scrollYRef = useRef(initialUi.scrollY);
  useEffect(() => {
    let frame: number | null = null;
    const onScroll = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        scrollYRef.current = window.scrollY;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame !== null) cancelAnimationFrame(frame);
      useLiveUiStore.getState().save({ ...uiRef.current, scrollY: scrollYRef.current });
    };
  }, []);

  const selectView = useCallback((next: LiveViewId) => {
    setView(next);
    setQuery('');
    // La nouvelle liste repart du haut (sinon on atterrit en bas d'une liste courte).
    window.scrollTo({ top: 0 });
    void settingsRepository.setSetting(SETTING_KEY, next).catch(() => undefined);
  }, []);

  const categoryName = useMemo(() => new Map(slice.categories.map((c) => [c.id, c.name] as const)), [slice.categories]);

  // --- Sources ------------------------------------------------------------------
  const lineup = useLiveLineup();
  // Guide TV : « 20:45 · Le film du soir » sous chaque chaine FR.
  const { nowFor } = useTvNow();
  const { rank } = useVersionRanking();
  const lineupView = !search.active && isLineupView(view);
  const visibleGroups = useMemo(
    () => (lineup.groups !== null ? withoutHidden(lineup.groups, hidden) : null),
    [lineup.groups, hidden],
  );
  const viewGroups = useMemo(
    () => (lineupView && visibleGroups !== null && isLineupView(view) ? filterLineup(visibleGroups, view) : []),
    [lineupView, visibleGroups, view],
  );

  const favoritesView = !search.active && (view === 'favorites' || currentTabId !== null);
  const favorites = useFavoriteItems(currentTabId, LIVE_ONLY);

  const catalogFilter: LiveFilter | null =
    search.active || (view !== 'international' && view !== 'all')
      ? null
      : view === 'international'
        ? { kind: 'nonFrench' }
        : { kind: 'all' };
  const catalog = useLiveCatalogPage(catalogFilter, hidden);

  // --- Liste affichee -------------------------------------------------------------
  // Flux -> chaine de la grille (versions regroupees dans la recherche et les favoris).
  const groupById = useMemo(() => {
    const map = new Map<string, LineupGroup>();
    for (const group of visibleGroups ?? []) for (const v of group.versions) map.set(v.id, group);
    return map;
  }, [visibleGroups]);
  const groupByKey = useMemo(() => new Map((visibleGroups ?? []).map((g) => [g.key, g] as const)), [visibleGroups]);

  const items: ListItem[] = useMemo(() => {
    if (search.active) {
      // Une ligne par CHAINE (« TF1 » et ses versions), pas une par flux.
      const seen = new Set<string>();
      return search.results.flatMap((c): ListItem[] => {
        const group = groupById.get(c.id);
        if (group === undefined) return [{ kind: 'row', row: channelRow(c, categoryName) }];
        if (seen.has(group.key)) return [];
        seen.add(group.key);
        return [{ kind: 'row', row: groupRow(group, categoryName, nowFor, rank) }];
      });
    }
    if (favoritesView) {
      return favorites.channels.map((c) => ({
        kind: 'row',
        row: favoriteRow(c, categoryName, c.groupKey !== null ? groupByKey.get(c.groupKey) : undefined, nowFor, rank),
      }));
    }
    if (catalogFilter !== null) return catalog.channels.map((c) => ({ kind: 'row', row: channelRow(c, categoryName) }));
    if (view === 'france') {
      return buildOverview(viewGroups).map((item) =>
        item.kind === 'header'
          ? { kind: 'header', header: item }
          : { kind: 'row', row: groupRow(item.group, categoryName, nowFor, rank) },
      );
    }
    return viewGroups.map((g) => ({ kind: 'row', row: groupRow(g, categoryName, nowFor, rank) }));
    // catalogFilter : derive de view/search (deja en deps).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    search.active,
    search.results,
    groupById,
    groupByKey,
    favoritesView,
    favorites.channels,
    catalog.channels,
    view,
    viewGroups,
    categoryName,
    nowFor,
    rank,
  ]);

  // Contexte de zapping (⏮ ⏭ du lecteur) = la vue d'ou la chaine est lancee.
  const zapEntries = useMemo(() => {
    if (favoritesView) return favorites.channels.map((c) => ({ id: c.id, groupKey: c.groupKey }));
    if (lineupView) return viewGroups.map((g) => ({ id: rank(g.versions)[0]!.id, groupKey: g.key }));
    return items.flatMap((i) => (i.kind === 'row' ? [{ id: i.row.id, groupKey: null }] : []));
  }, [favoritesView, favorites.channels, lineupView, viewGroups, items, rank]);
  const tabName = tabs.find((t) => t.id === currentTabId)?.name;
  const onPlay = useCallback(() => {
    setZapContext({ label: search.active ? 'Résultats de recherche' : viewLabel(view, tabName), entries: zapEntries });
  }, [search.active, view, tabName, zapEntries]);
  const onPlayRecent = useCallback(() => {
    setZapContext({
      label: 'Récemment regardées',
      entries: recentChannels.slice(0, 10).map((e) => ({ id: e.itemId, groupKey: null })),
    });
  }, [recentChannels]);

  const canPage = catalogFilter !== null && !catalog.exhausted;
  const loadMore = useCallback(() => {
    if (visible < items.length) setVisible((v) => v + STEP);
    else if (canPage) catalog.loadMore();
  }, [visible, items.length, canPage, catalog]);
  const sentinelRef = useLoadMore(loadMore, visible < items.length || canPage, `${visible}:${items.length}`);

  // --- Etats ----------------------------------------------------------------------
  // Avant la relecture du catalogue local, « vide » ne veut encore rien dire.
  const catalogEmpty = catalogHydrated && slice.categories.length === 0 && slice.status !== 'loading';
  const lineupPending = lineupView && (visibleGroups === null || lineup.status === 'building');
  // Lecture locale en echec : message + « Reessayer », jamais une fausse liste vide.
  const listError = search.active
    ? search.error
    : favoritesView
      ? favorites.error
      : catalogFilter !== null && catalog.error;
  const retryList = search.active ? search.retry : favoritesView ? favorites.retry : catalog.retry;
  const loading = !catalogHydrated
    ? true
    : search.active
    ? search.loading && search.results.length === 0
    : favoritesView
      ? favorites.loading && favorites.channels.length === 0
      : catalogFilter !== null
        ? catalog.loading
        : lineupPending;
  const rowCount = items.filter((i) => i.kind === 'row').length;

  // Position retrouvee au retour, une fois la liste a nouveau affichee.
  const scrollRestoredRef = useRef(initialUi.scrollY <= 0);
  useEffect(() => {
    if (scrollRestoredRef.current || loading || rowCount === 0) return;
    scrollRestoredRef.current = true;
    requestAnimationFrame(() => window.scrollTo({ top: initialUi.scrollY }));
  }, [loading, rowCount, initialUi.scrollY]);

  let summary: string | null = null;
  if (search.active) {
    summary = `${rowCount}${rowCount >= LIVE_SEARCH_LIMIT ? '+' : ''} résultat${rowCount > 1 ? 's' : ''}`;
  } else if (lineupView && !lineupPending) {
    const streams = viewGroups.reduce((n, g) => n + g.versions.length, 0);
    summary = `${formatCount(viewGroups.length)} chaîne${viewGroups.length > 1 ? 's' : ''} · ${formatCount(streams)} flux`;
  } else if (favoritesView && !favorites.loading) {
    summary = `${rowCount} chaîne${rowCount > 1 ? 's' : ''}`;
  } else if (catalogFilter !== null && catalog.count !== null) {
    summary = `${formatCount(catalog.count)} chaîne${catalog.count > 1 ? 's' : ''}`;
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6 md:px-8">
      <h1 className="sr-only">Live TV</h1>
      <div className="flex justify-end md:hidden">
        <BrandMark />
      </div>

      <div className="relative mt-4">
        <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-fg-faint" />
        <Input
          ref={searchRef}
          type="search"
          enterKeyHint="search"
          className="pl-10 pr-12"
          placeholder="Rechercher une chaîne…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          // Entree = fermer le clavier pour voir les resultats.
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
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
              searchRef.current?.focus();
            }}
            className="absolute right-1 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full text-fg-faint hover:text-fg"
          >
            <IconX className="h-4 w-4" />
          </button>
        )}
      </div>

      {!search.active && <RecentChannelsStrip onPlay={onPlayRecent} />}

      <LiveViewBar
        view={view}
        tabs={tabs}
        onSelect={selectView}
        onCreateTab={() => setCreatingTab(true)}
      />

      {summary !== null && <p className="mt-3 px-1 text-xs text-fg-faint">{summary}</p>}

      {catalogEmpty ? (
        <div className="mt-6">
          <EmptyState
            title="Catalogue non synchronisé"
            hint="Récupère les chaînes de ton serveur pour commencer."
            action={<SyncCatalogButton />}
          />
        </div>
      ) : lineupView && lineup.status === 'error' ? (
        <div className="mt-6">
          <ErrorState title="Impossible de classer les chaînes" onRetry={lineup.retry} />
        </div>
      ) : listError ? (
        <div className="mt-6">
          <ErrorState title="Impossible de lire les chaînes" onRetry={retryList} />
        </div>
      ) : loading ? (
        <div className="mt-3">
          {lineupPending && lineup.status === 'building' && (
            <p className="mb-3 px-1 text-xs text-fg-muted">Classement des chaînes françaises…</p>
          )}
          <div className="flex flex-col gap-2 sm:grid sm:grid-cols-2 sm:gap-x-4">
            {Array.from({ length: 12 }, (_, i) => (
              <Skeleton key={i} className="h-14 rounded-xl" />
            ))}
          </div>
        </div>
      ) : rowCount === 0 ? (
        <div className="mt-6">
          <LiveEmpty view={view} searching={search.active} tabName={tabName} />
        </div>
      ) : (
        <div className="mt-2">
          <div className="flex flex-col sm:grid sm:grid-cols-2 sm:gap-x-4">
            {items.slice(0, visible).map((item) =>
              item.kind === 'header' ? (
                <SectionHeader key={`h:${item.header.section}`} header={item.header} onOpen={selectView} />
              ) : (
                <LiveChannelRow key={item.row.id} row={item.row} onPlay={onPlay} />
              ),
            )}
          </div>
          {favoritesView && favorites.missing > 0 && (
            <p className="mt-4 px-1 text-xs text-fg-faint">
              {favorites.missing} chaîne{favorites.missing > 1 ? 's' : ''} introuvable
              {favorites.missing > 1 ? 's' : ''} depuis la dernière synchronisation.
            </p>
          )}
          <div ref={sentinelRef} className="h-10" />
        </div>
      )}

      {creatingTab && (
        <TabNameDialog
          title="Nouvel onglet"
          confirmLabel="Créer"
          onClose={() => setCreatingTab(false)}
          onSubmit={async (name) => {
            const tab = await createTab(name);
            selectView(`tab:${tab.id}`);
          }}
        />
      )}
    </main>
  );
}

function SectionHeader({
  header,
  onOpen,
}: {
  header: Extract<OverviewItem, { kind: 'header' }>;
  onOpen: (view: LiveViewId) => void;
}) {
  const target = header.view;
  return (
    <div className="mt-6 flex items-center justify-between px-1 pb-1.5 first:mt-2 sm:col-span-2">
      <h2 className="text-sm font-semibold text-fg">
        {header.label} <span className="font-normal text-fg-faint">· {header.count}</span>
      </h2>
      {target !== null && (
        <button
          type="button"
          onClick={() => onOpen(target)}
          className="-my-2 -mr-2 flex items-center gap-0.5 px-2 py-3 text-xs text-fg-faint hover:text-fg"
        >
          Tout voir
          <IconChevronRight className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function LiveEmpty({ view, searching, tabName }: { view: LiveViewId; searching: boolean; tabName?: string }) {
  if (searching) return <EmptyState title="Aucune chaîne trouvée" hint="Essaie un autre nom ou une partie du nom." />;
  if (view === 'favorites') {
    return <EmptyState title="Aucune chaîne favorite" hint="Touche le cœur d'une chaîne pour la retrouver ici." />;
  }
  if (tabIdOf(view) !== null) {
    return (
      <EmptyState
        title={`« ${tabName ?? 'Onglet'} » est vide`}
        hint="Touche ⋯ sur une chaîne puis coche cet onglet."
      />
    );
  }
  if (view === 'france') {
    return (
      <EmptyState
        title="Aucune chaîne française détectée"
        hint="Les autres pays restent disponibles dans International et Tous."
      />
    );
  }
  return <EmptyState title="Aucune chaîne dans cette vue" />;
}
