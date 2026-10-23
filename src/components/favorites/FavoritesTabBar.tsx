'use client';

import { HScroll } from '@/components/shared/HScroll';
import { IconPlus } from '@/components/ui/actionIcons';
import { IconHeart } from '@/components/ui/icons';
import { cn } from '@/lib/cn';
import { useFavoritesStore } from '@/stores/favoritesStore';

/** `null` = « Mes favoris » (tout), sinon id d'onglet. */
export type FavoritesSelection = string | null;

/** Onglets de la page Favoris : Mes favoris · onglets perso (compteurs) · « + ». */
export function FavoritesTabBar({
  selected,
  onSelect,
  onCreate,
}: {
  selected: FavoritesSelection;
  onSelect: (tabId: FavoritesSelection) => void;
  onCreate: () => void;
}) {
  const tabs = useFavoritesStore((s) => s.tabs);
  const tabItems = useFavoritesStore((s) => s.tabItems);
  const total = useFavoritesStore((s) => s.ids.live.size + s.ids.vod.size + s.ids.series.size);

  const pill = (id: FavoritesSelection, label: string, count: number, icon?: boolean) => {
    const active = selected === id;
    return (
      <button
        key={id ?? 'all'}
        type="button"
        onClick={() => onSelect(id)}
        aria-pressed={active}
        className={cn(
          'flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-medium transition-colors',
          active ? 'bg-accent text-white' : 'bg-ink-800 text-fg-muted hover:text-fg',
        )}
      >
        {icon === true && <IconHeart className="h-3.5 w-3.5" filled={active} />}
        {label}
        <span className={cn('text-[11px] tabular-nums', active ? 'text-white/75' : 'text-fg-faint')}>{count}</span>
      </button>
    );
  };

  return (
    <HScroll className="glass sticky top-safe z-30 -mx-4 mt-4 flex items-center gap-2 px-4 py-2 [scrollbar-width:none] md:-mx-8 md:px-8">
      {pill(null, 'Mes favoris', total, true)}
      {tabs.map((tab) => pill(tab.id, tab.name, tabItems[tab.id]?.length ?? 0))}
      <button
        type="button"
        onClick={onCreate}
        className="flex h-9 shrink-0 items-center gap-1 rounded-full border border-dashed border-ink-500 px-3 text-[13px] font-medium text-fg-muted hover:border-fg-faint hover:text-fg"
      >
        <IconPlus className="h-4 w-4" />
        Onglet
      </button>
    </HScroll>
  );
}
