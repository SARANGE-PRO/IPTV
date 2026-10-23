'use client';

import { IconFolder } from '@/components/ui/actionIcons';
import { cn } from '@/lib/cn';
import { itemKey } from '@/services/favorites/favoriteTabsService';
import { useFavoritesStore } from '@/stores/favoritesStore';
import { useFavoritesUiStore } from '@/stores/favoritesUiStore';
import type { MediaType } from '@/types/models';

/** Ouvre « Ranger dans un onglet » (a cote du coeur : fiches, lecteur Live). */
export function ArrangeButton({
  type,
  itemId,
  title,
  className,
}: {
  type: MediaType;
  itemId: string;
  title: string;
  className?: string;
}) {
  const openSheet = useFavoritesUiStore((s) => s.openSheet);
  const inTabs = useFavoritesStore((s) => (s.membership.get(itemKey(type, itemId))?.size ?? 0) > 0);
  return (
    <button
      type="button"
      aria-label="Ranger dans un onglet"
      title="Ranger dans un onglet"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        openSheet({ type, itemId, title });
      }}
      className={cn(
        'rounded-full bg-black/50 p-2 backdrop-blur transition-colors',
        inTabs ? 'text-fg' : 'text-fg-muted hover:text-fg',
        className,
      )}
    >
      <IconFolder className="h-4 w-4" />
    </button>
  );
}
