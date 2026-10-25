'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FavoriteEditList, type EditableItem } from '@/components/favorites/FavoriteEditList';
import { FavoritesTabBar, type FavoritesSelection } from '@/components/favorites/FavoritesTabBar';
import { TabEditPanel } from '@/components/favorites/TabEditPanel';
import { TabNameDialog } from '@/components/favorites/TabNameDialog';
import { LiveChannelRow, type LiveRowData } from '@/components/live/LiveChannelRow';
import { BrandMark } from '@/components/shared/BrandMark';
import { EmptyState } from '@/components/shared/EmptyState';
import { ErrorState } from '@/components/shared/ErrorState';
import { MediaCard } from '@/components/shared/MediaCard';
import { Skeleton } from '@/components/ui/Skeleton';
import { useFavoriteItems } from '@/hooks/useFavoriteItems';
import { useLiveLineup } from '@/hooks/useLiveLineup';
import { useTvNow } from '@/hooks/useTvNow';
import { useVersionRanking } from '@/hooks/useVersionRanking';
import { cn } from '@/lib/cn';
import * as settingsRepository from '@/services/data/settingsDataService';
import { itemKey, parseItemKey } from '@/services/favorites/favoriteTabsService';
import { setZapContext } from '@/services/live/liveZappingService';
import { useCatalogStore } from '@/stores/catalogStore';
import { useFavoritesStore } from '@/stores/favoritesStore';
import { useFavoritesUiStore } from '@/stores/favoritesUiStore';
import type { MediaType } from '@/types/models';
import { displayTitle, displayYear } from '@/utils/displayTitle';
import { movieHref, seriesHref } from '@/utils/appRoutes';
import { variantBadge } from '@/utils/variantPreference';

/**
 * Favoris : « Mes favoris » + onglets crees par l'utilisateur (chaines, films
 * et series melanges). Mode Modifier : glisser pour reordonner, retirer,
 * renommer / deplacer / supprimer l'onglet.
 */

type Kind = 'all' | 'live' | 'vod' | 'series';
type Sort = 'mine' | 'name';

const KINDS: { id: Kind; label: string }[] = [
  { id: 'all', label: 'Tout' },
  { id: 'live', label: 'Chaînes' },
  { id: 'vod', label: 'Films' },
  { id: 'series', label: 'Séries' },
];

const SETTING_KEY = 'lastFavoritesTab';

const byName = <T,>(items: T[], name: (item: T) => string): T[] =>
  [...items].sort((a, b) => name(a).localeCompare(name(b), 'fr'));

export default function FavoritesPage() {
  const tabs = useFavoritesStore((s) => s.tabs);
  const hydrated = useFavoritesStore((s) => s.hydrated);
  const createTab = useFavoritesStore((s) => s.createTab);
  const renameTab = useFavoritesStore((s) => s.renameTab);
  const deleteTab = useFavoritesStore((s) => s.deleteTab);
  const reorderTabs = useFavoritesStore((s) => s.reorderTabs);
  const reorderTab = useFavoritesStore((s) => s.reorderTab);
  const reorderFavorites = useFavoritesStore((s) => s.reorderFavorites);
  const removeFavorite = useFavoritesStore((s) => s.remove);
  const setItemTabs = useFavoritesStore((s) => s.setItemTabs);
  const showToast = useFavoritesUiStore((s) => s.showToast);

  const [selected, setSelected] = useState<FavoritesSelection>(null);
  const [kind, setKind] = useState<Kind>('all');
  const [sort, setSort] = useState<Sort>('mine');
  const [editing, setEditing] = useState(false);
  const [dialog, setDialog] = useState<'create' | 'rename' | null>(null);

  const restoredRef = useRef(false);
  useEffect(() => {
    if (!hydrated || restoredRef.current) return;
    restoredRef.current = true;
    void settingsRepository
      .getSetting<string>(SETTING_KEY)
      .then((saved) => {
        if (saved !== undefined && useFavoritesStore.getState().tabs.some((t) => t.id === saved)) setSelected(saved);
      })
      .catch(() => undefined);
  }, [hydrated]);

  // Onglet supprime : retour a « Mes favoris ».
  useEffect(() => {
    if (selected !== null && hydrated && !tabs.some((t) => t.id === selected)) setSelected(null);
  }, [selected, tabs, hydrated]);

  const select = useCallback((tabId: FavoritesSelection) => {
    setSelected(tabId);
    setEditing(false);
    void settingsRepository.setSetting(SETTING_KEY, tabId ?? '').catch(() => undefined);
  }, []);

  const data = useFavoriteItems(selected);
  // Versions (HD/FHD…) et categorie des chaines, comme dans la page Live.
  const lineup = useLiveLineup();
  const { nowFor } = useTvNow();
  const { rank } = useVersionRanking();
  const liveCategories = useCatalogStore((s) => s.sections.live.categories);
  const categoryName = useMemo(() => new Map(liveCategories.map((c) => [c.id, c.name] as const)), [liveCategories]);
  const groupByKey = useMemo(() => new Map((lineup.groups ?? []).map((g) => [g.key, g] as const)), [lineup.groups]);
  const tab = tabs.find((t) => t.id === selected) ?? null;
  const tabIndex = tab !== null ? tabs.indexOf(tab) : -1;

  const sorted = sort === 'name' && !editing;
  const channels = useMemo(() => (sorted ? byName(data.channels, (c) => c.name) : data.channels), [sorted, data.channels]);
  const movies = useMemo(() => (sorted ? byName(data.movies, (m) => displayTitle(m.name)) : data.movies), [sorted, data.movies]);
  const series = useMemo(() => (sorted ? byName(data.series, (s) => displayTitle(s.name)) : data.series), [sorted, data.series]);

  const show = (k: Exclude<Kind, 'all'>) => kind === 'all' || kind === k;
  const total = data.channels.length + data.movies.length + data.series.length;
  const visibleCount =
    (show('live') ? data.channels.length : 0) + (show('vod') ? data.movies.length : 0) + (show('series') ? data.series.length : 0);

  const channelRows: LiveRowData[] = useMemo(
    () =>
      channels.map((c) => {
        const group = c.groupKey !== null ? groupByKey.get(c.groupKey) : undefined;
        return {
          id: c.id,
          name: c.name,
          logoUrl: c.logoUrl,
          logoAlternates: c.logoAlternates,
          isFrench: c.isFrench === 1,
          lcn: c.lcn,
          badges: c.qualityLabel !== null ? [c.qualityLabel] : [],
          versions:
            group !== undefined && group.versions.length > 1
              ? rank(group.versions).map((v) => ({ id: v.id, label: v.qualityLabel }))
              : undefined,
          categoryId: c.categoryId,
          categoryName: categoryName.get(c.categoryId),
          now: group !== undefined && group.country === null ? nowFor(group.name) : null,
        };
      }),
    [channels, groupByKey, categoryName, nowFor, rank],
  );
  const onPlayChannel = useCallback(() => {
    setZapContext({
      label: tab?.name ?? 'Favoris',
      entries: channels.map((c) => ({ id: c.id, groupKey: c.groupKey })),
    });
  }, [tab, channels]);

  // --- Edition ----------------------------------------------------------------
  const reorder = (type: Exclude<MediaType, 'episode'>) => (keys: string[]) => {
    if (selected === null) void reorderFavorites(type, keys.map((k) => parseItemKey(k).itemId));
    else void reorderTab(selected, keys);
  };
  const remove = (key: string) => {
    const { type, itemId } = parseItemKey(key);
    const rawTitle =
      type === 'live'
        ? data.channels.find((c) => c.id === itemId)?.name
        : type === 'vod'
          ? data.movies.find((m) => m.id === itemId)?.name
          : data.series.find((s) => s.id === itemId)?.name;
    const title = rawTitle !== undefined ? displayTitle(rawTitle) : '';
    if (selected === null) {
      void removeFavorite(type, itemId).then(() => showToast({ kind: 'removed', title }));
      return;
    }
    const tabId = selected;
    const before = [...(useFavoritesStore.getState().membership.get(key) ?? [])];
    void setItemTabs(
      type,
      itemId,
      before.filter((id) => id !== tabId),
    ).then(() =>
      showToast({
        kind: 'info',
        message: `« ${title} » retiré de « ${tab?.name ?? 'l’onglet'} »`,
        undo: () => setItemTabs(type, itemId, before),
      }),
    );
  };

  const editChannels: EditableItem[] = channels.map((c) => ({
    key: itemKey('live', c.id),
    title: c.name,
    subtitle: c.qualityLabel,
    image: { kind: 'logo', logoUrl: c.logoUrl },
  }));
  const editMovies: EditableItem[] = movies.map((m) => ({
    key: itemKey('vod', m.id),
    title: displayTitle(m.name),
    subtitle: displayYear(m.name, m.year)?.toString() ?? null,
    image: { kind: 'poster', posterUrl: m.posterUrl },
  }));
  const editSeries: EditableItem[] = series.map((s) => ({
    key: itemKey('series', s.id),
    title: displayTitle(s.name),
    subtitle: s.releaseDate?.slice(0, 4) ?? null,
    image: { kind: 'poster', posterUrl: s.posterUrl },
  }));
  const removeLabel = selected === null ? 'Retirer des favoris' : 'Retirer de l’onglet';

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6 md:px-8">
      <h1 className="sr-only">Favoris</h1>
      <div className="flex justify-end md:hidden">
        <BrandMark />
      </div>

      <FavoritesTabBar selected={selected} onSelect={select} onCreate={() => setDialog('create')} />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="flex rounded-full bg-ink-800 p-0.5">
          {KINDS.map((k) => (
            <button
              key={k.id}
              type="button"
              onClick={() => setKind(k.id)}
              className={cn(
                'rounded-full px-3 py-2.5 text-xs font-medium transition-colors',
                kind === k.id ? 'bg-ink-600 text-fg' : 'text-fg-muted hover:text-fg',
              )}
            >
              {k.label}
            </button>
          ))}
        </div>
        {/* Tri + Modifier : un bloc (passe a la ligne d'un seul tenant). */}
        <div className="ml-auto flex items-center gap-1">
          {!editing && total > 1 && (
            <button
              type="button"
              onClick={() => setSort((s) => (s === 'mine' ? 'name' : 'mine'))}
              className="rounded-full px-3 py-3 text-xs font-medium text-fg-muted hover:text-fg"
            >
              {sort === 'mine' ? 'Trier A → Z' : 'Mon ordre'}
            </button>
          )}
          {(total > 0 || tab !== null) && (
            <button
              type="button"
              onClick={() => setEditing((e) => !e)}
              className={cn(
                'rounded-full px-4 py-2.5 text-xs font-semibold transition-colors',
                editing ? 'bg-accent text-white' : 'bg-ink-800 text-fg hover:bg-ink-700',
              )}
            >
              {editing ? 'Terminé' : 'Modifier'}
            </button>
          )}
        </div>
      </div>

      {editing && tab !== null && (
        <TabEditPanel
          tab={tab}
          index={tabIndex}
          count={tabs.length}
          onRename={() => setDialog('rename')}
          onMove={(direction) => {
            const ids = tabs.map((t) => t.id);
            const to = tabIndex + direction;
            [ids[tabIndex], ids[to]] = [ids[to]!, ids[tabIndex]!];
            void reorderTabs(ids);
          }}
          onDelete={() => {
            const name = tab.name;
            const position = tabIndex;
            // Contenu de l'onglet (dans son ordre) pour pouvoir le recreer a l'identique.
            const keys = [
              ...data.channels.map((c) => itemKey('live', c.id)),
              ...data.movies.map((m) => itemKey('vod', m.id)),
              ...data.series.map((x) => itemKey('series', x.id)),
            ];
            setEditing(false);
            void deleteTab(tab.id).then(() =>
              showToast({
                kind: 'info',
                message: `Onglet « ${name} » supprimé — tes favoris sont conservés`,
                undo: async () => {
                  const restored = await createTab(name);
                  for (const k of keys) {
                    const { type, itemId } = parseItemKey(k);
                    const current = [...(useFavoritesStore.getState().membership.get(k) ?? [])];
                    await setItemTabs(type, itemId, [...current, restored.id]);
                  }
                  await reorderTab(restored.id, keys);
                  const ids = useFavoritesStore.getState().tabs.map((t) => t.id).filter((id) => id !== restored.id);
                  ids.splice(position, 0, restored.id);
                  await reorderTabs(ids);
                  select(restored.id);
                },
              }),
            );
          }}
        />
      )}

      <div className="mt-2">
        {data.loading && total === 0 ? (
          <div className="mt-4 flex flex-col gap-2">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-14 rounded-xl" />
            ))}
          </div>
        ) : data.error && total === 0 ? (
          <div className="mt-6">
            <ErrorState title="Impossible de lire tes favoris" onRetry={data.retry} />
          </div>
        ) : total === 0 ? (
          <div className="mt-6">
            {tab !== null ? (
              <EmptyState
                title={`« ${tab.name} » est vide`}
                hint="Chaînes : touche ⋯ puis coche cet onglet. Films et séries : touche le cœur, puis « Ranger »."
              />
            ) : (
              <EmptyState
                title="Aucun favori pour l'instant"
                hint="Touche le cœur sur une chaîne, un film ou une série. Range-les ensuite dans tes propres onglets."
              />
            )}
          </div>
        ) : visibleCount === 0 ? (
          <div className="mt-6">
            <EmptyState title={`Aucun élément de ce type${tab !== null ? ` dans « ${tab.name} »` : ''}`} />
          </div>
        ) : editing ? (
          <>
            <p className="mt-4 px-1 text-xs text-fg-faint">Glisse la poignée pour changer l’ordre.</p>
            {show('live') && (
              <FavoriteEditList label="Chaînes" items={editChannels} removeLabel={removeLabel} onReorder={reorder('live')} onRemove={remove} />
            )}
            {show('vod') && (
              <FavoriteEditList label="Films" items={editMovies} removeLabel={removeLabel} onReorder={reorder('vod')} onRemove={remove} />
            )}
            {show('series') && (
              <FavoriteEditList label="Séries" items={editSeries} removeLabel={removeLabel} onReorder={reorder('series')} onRemove={remove} />
            )}
          </>
        ) : (
          <>
            {show('live') && channelRows.length > 0 && (
              <section className="mt-5">
                <SectionTitle label="Chaînes" count={channelRows.length} />
                <div className="flex flex-col sm:grid sm:grid-cols-2 sm:gap-x-4">
                  {channelRows.map((row) => (
                    <LiveChannelRow key={row.id} row={row} onPlay={onPlayChannel} />
                  ))}
                </div>
              </section>
            )}
            {show('vod') && movies.length > 0 && (
              <section className="mt-7">
                <SectionTitle label="Films" count={movies.length} />
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
                  {movies.map((m) => (
                    <MediaCard
                      key={m.id}
                      href={movieHref(m.id)}
                      title={displayTitle(m.name)}
                      posterUrl={m.posterUrl}
                      subtitle={displayYear(m.name, m.year)?.toString() ?? null}
                      rating={m.ratingSort > 0 ? m.ratingSort : null}
                      tag={variantBadge(m.variant, m.variantSource)}
                      favorite={{ type: 'vod', itemId: m.id }}
                    />
                  ))}
                </div>
              </section>
            )}
            {show('series') && series.length > 0 && (
              <section className="mt-7">
                <SectionTitle label="Séries" count={series.length} />
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
                  {series.map((s) => (
                    <MediaCard
                      key={s.id}
                      href={seriesHref(s.id)}
                      title={displayTitle(s.name)}
                      posterUrl={s.posterUrl}
                      subtitle={s.releaseDate?.slice(0, 4) ?? null}
                      rating={s.ratingSort > 0 ? s.ratingSort : null}
                      tag={variantBadge(s.variant, s.variantSource)}
                      favorite={{ type: 'series', itemId: s.id }}
                    />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
        {data.missing > 0 && (
          <p className="mt-6 px-1 text-xs text-fg-faint">
            {data.missing} élément{data.missing > 1 ? 's' : ''} introuvable{data.missing > 1 ? 's' : ''} depuis la
            dernière synchronisation (masqué{data.missing > 1 ? 's' : ''}).
          </p>
        )}
      </div>

      {dialog === 'create' && (
        <TabNameDialog
          title="Nouvel onglet"
          confirmLabel="Créer"
          onClose={() => setDialog(null)}
          onSubmit={async (name) => {
            const created = await createTab(name);
            select(created.id);
          }}
        />
      )}
      {dialog === 'rename' && tab !== null && (
        <TabNameDialog
          title="Renommer l'onglet"
          initial={tab.name}
          confirmLabel="Renommer"
          onClose={() => setDialog(null)}
          onSubmit={(name) => renameTab(tab.id, name)}
        />
      )}
    </main>
  );
}

function SectionTitle({ label, count }: { label: string; count: number }) {
  return (
    <h2 className="mb-2 px-1 text-sm font-semibold text-fg">
      {label} <span className="font-normal text-fg-faint">· {count}</span>
    </h2>
  );
}
