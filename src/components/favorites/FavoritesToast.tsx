'use client';

import { useEffect } from 'react';
import { IconHeart } from '@/components/ui/icons';
import { useFavoritesStore } from '@/stores/favoritesStore';
import { useFavoritesUiStore } from '@/stores/favoritesUiStore';

const DURATION_MS = 4500;

/**
 * Toast global des favoris (monte une fois dans le layout de l'app) :
 * « Ajouté à tes favoris · Ranger » / « Retiré des favoris · Annuler ».
 */
export function FavoritesToast() {
  const toast = useFavoritesUiStore((s) => s.toast);
  const dismiss = useFavoritesUiStore((s) => s.dismissToast);
  const openSheet = useFavoritesUiStore((s) => s.openSheet);
  const undoRemove = useFavoritesStore((s) => s.undoRemove);

  useEffect(() => {
    if (toast === null) return;
    const timer = setTimeout(() => dismiss(toast.id), DURATION_MS);
    return () => clearTimeout(timer);
  }, [toast, dismiss]);

  if (toast === null) return null;

  const message =
    toast.kind === 'added'
      ? 'Ajouté à tes favoris'
      : toast.kind === 'removed'
        ? 'Retiré des favoris'
        : toast.message;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom)+var(--zib-mini-offset,0px))] z-[70] flex justify-center px-4 md:bottom-[calc(1.5rem+var(--zib-mini-offset,0px))] md:pl-60"
    >
      <div
        key={toast.id}
        className="glass pointer-events-auto flex max-w-md animate-fade-in items-center gap-3 rounded-2xl border border-white/10 py-2 pl-4 pr-2 shadow-2xl shadow-black/50"
      >
        {toast.kind !== 'info' && (
          <IconHeart className="h-4 w-4 shrink-0 text-accent" filled={toast.kind === 'added'} />
        )}
        <span className="min-w-0 flex-1 truncate text-sm text-fg">{message}</span>
        {toast.kind === 'added' && (
          <button
            type="button"
            onClick={() => openSheet(toast.target)}
            className="shrink-0 rounded-xl px-3 py-1.5 text-sm font-semibold text-accent hover:bg-white/5"
          >
            Ranger
          </button>
        )}
        {toast.kind === 'removed' && (
          <button
            type="button"
            onClick={() => void undoRemove().then(() => dismiss(toast.id))}
            className="shrink-0 rounded-xl px-3 py-1.5 text-sm font-semibold text-accent hover:bg-white/5"
          >
            Annuler
          </button>
        )}
      </div>
    </div>
  );
}
