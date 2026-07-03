'use client';

import { IconHeart } from '@/components/ui/icons';
import { cn } from '@/lib/cn';
import { useFavoritesStore } from '@/stores/favoritesStore';
import type { MediaType } from '@/types/models';

export function FavoriteButton({
  type,
  itemId,
  className,
}: {
  type: MediaType;
  itemId: string;
  className?: string;
}) {
  const isFavorite = useFavoritesStore((s) => s.ids[type].has(itemId));
  const toggle = useFavoritesStore((s) => s.toggle);
  return (
    <button
      aria-label={isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void toggle(type, itemId);
      }}
      className={cn(
        'rounded-full bg-black/50 p-2 backdrop-blur transition-colors',
        isFavorite ? 'text-accent' : 'text-fg-muted hover:text-fg',
        className,
      )}
    >
      <IconHeart className="h-4 w-4" filled={isFavorite} />
    </button>
  );
}
