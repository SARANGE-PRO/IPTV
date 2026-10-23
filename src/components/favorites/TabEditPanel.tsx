'use client';

import { useEffect, useState } from 'react';
import { IconChevronLeft, IconChevronRight, IconPencil } from '@/components/ui/actionIcons';
import { IconTrash } from '@/components/ui/icons';
import { cn } from '@/lib/cn';
import type { FavoriteTab } from '@/types/models';

/** Barre d'edition d'un onglet : renommer, deplacer, supprimer (en 2 temps). */
export function TabEditPanel({
  tab,
  index,
  count,
  onRename,
  onMove,
  onDelete,
}: {
  tab: FavoriteTab;
  index: number;
  count: number;
  onRename: () => void;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    setConfirming(false);
  }, [tab.id]);

  useEffect(() => {
    if (!confirming) return;
    const timer = setTimeout(() => setConfirming(false), 4000);
    return () => clearTimeout(timer);
  }, [confirming]);

  const action = 'flex h-9 items-center gap-1.5 rounded-xl px-2.5 text-xs font-medium transition-colors disabled:opacity-30';

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-ink-700/70 bg-ink-900/70 p-2">
      <button type="button" onClick={onRename} className={cn(action, 'bg-ink-800 text-fg hover:bg-ink-700')}>
        <IconPencil className="h-4 w-4" />
        Renommer
      </button>
      <div className="flex items-center rounded-xl bg-ink-800">
        <button
          type="button"
          onClick={() => onMove(-1)}
          disabled={index === 0}
          aria-label="Déplacer l'onglet vers la gauche"
          className={cn(action, 'text-fg hover:bg-ink-700')}
        >
          <IconChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => onMove(1)}
          disabled={index === count - 1}
          aria-label="Déplacer l'onglet vers la droite"
          className={cn(action, 'text-fg hover:bg-ink-700')}
        >
          <IconChevronRight className="h-4 w-4" />
        </button>
      </div>
      <button
        type="button"
        onClick={() => (confirming ? onDelete() : setConfirming(true))}
        className={cn(
          action,
          'ml-auto',
          confirming ? 'bg-accent text-white' : 'bg-ink-800 text-fg-muted hover:text-accent',
        )}
      >
        <IconTrash className="h-4 w-4" />
        {confirming ? 'Confirmer' : 'Supprimer'}
      </button>
    </div>
  );
}
