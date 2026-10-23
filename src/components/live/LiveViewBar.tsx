'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { HScroll } from '@/components/shared/HScroll';
import { IconPlus } from '@/components/ui/actionIcons';
import { IconHeart } from '@/components/ui/icons';
import { cn } from '@/lib/cn';
import { CATALOG_VIEWS, LINEUP_VIEWS, tabViewId, type LiveViewId } from '@/services/live/liveViews';
import type { FavoriteTab } from '@/types/models';

/**
 * Pastilles de la page Live, en trois blocs : France · Favoris + onglets
 * perso (+) | sections de la grille FR | International · Tous. La pastille
 * active reste visible (defilement automatique).
 */
export function LiveViewBar({
  view,
  tabs,
  disabled = false,
  onSelect,
  onCreateTab,
}: {
  view: LiveViewId;
  tabs: FavoriteTab[];
  disabled?: boolean;
  onSelect: (view: LiveViewId) => void;
  onCreateTab: () => void;
}) {
  const activeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    // Defilement de la BARRE seule (scrollIntoView ferait aussi bouger la page sur iOS).
    const el = activeRef.current;
    const bar = el?.parentElement;
    if (el == null || bar == null) return;
    bar.scrollTo({ left: el.offsetLeft - (bar.clientWidth - el.clientWidth) / 2, behavior: 'smooth' });
  }, [view]);

  const pill = (id: LiveViewId, label: string, icon?: ReactNode) => {
    const active = !disabled && view === id;
    return (
      <button
        key={id}
        ref={active ? activeRef : undefined}
        type="button"
        onClick={() => onSelect(id)}
        disabled={disabled}
        aria-pressed={active}
        className={cn(
          'flex h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-[13px] font-medium transition-colors',
          active ? 'bg-accent text-white' : 'bg-ink-800 text-fg-muted hover:text-fg disabled:opacity-40',
        )}
      >
        {icon}
        {label}
      </button>
    );
  };

  return (
    <HScroll className="glass sticky top-safe z-30 -mx-4 mt-3 flex items-center gap-2 px-4 py-2 [scrollbar-width:none] md:-mx-8 md:px-8">
      {pill('france', 'France')}
      {pill('favorites', 'Favoris', <IconHeart className="h-3.5 w-3.5" filled={view === 'favorites' && !disabled} />)}
      {tabs.map((tab) => pill(tabViewId(tab.id), tab.name))}
      <button
        type="button"
        onClick={onCreateTab}
        disabled={disabled}
        aria-label="Créer un onglet"
        title="Créer un onglet"
        className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-dashed border-ink-500 text-fg-muted hover:border-fg-faint hover:text-fg disabled:opacity-40"
      >
        <IconPlus className="h-4 w-4" />
      </button>
      <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-ink-600" />
      {LINEUP_VIEWS.map((v) => pill(v.id, v.label))}
      <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-ink-600" />
      {CATALOG_VIEWS.map((v) => pill(v.id, v.label))}
    </HScroll>
  );
}
