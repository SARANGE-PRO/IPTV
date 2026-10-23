'use client';

import { IconHeart } from '@/components/ui/icons';
import { useFavoriteToggle } from '@/hooks/useFavoriteToggle';
import { cn } from '@/lib/cn';
import { useFavoritesStore } from '@/stores/favoritesStore';
import type { MediaType } from '@/types/models';

/** Coeur favori : bascule + toast (« Ranger » dans un onglet / « Annuler »). */
export function FavoriteButton({
  type,
  itemId,
  title = '',
  className,
}: {
  type: MediaType;
  itemId: string;
  /** Nom affiche dans la feuille « Ranger dans un onglet ». */
  title?: string;
  className?: string;
}) {
  const isFavorite = useFavoritesStore((s) => s.ids[type].has(itemId));
  const toggle = useFavoriteToggle();
  return (
    <button
      aria-label={isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void toggle({ type, itemId, title });
      }}
      className={cn(
        'relative hit-44 grid h-11 w-11 place-items-center rounded-full bg-black/50 backdrop-blur transition-colors',
        isFavorite ? 'text-accent' : 'text-fg-muted hover:text-fg',
        className,
      )}
    >
      <IconHeart className="h-4 w-4" filled={isFavorite} />
    </button>
  );
}
