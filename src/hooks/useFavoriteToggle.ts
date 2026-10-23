import { useCallback } from 'react';
import { useFavoritesStore } from '@/stores/favoritesStore';
import { useFavoritesUiStore, type FavoriteTarget } from '@/stores/favoritesUiStore';

/**
 * Bascule favori + toast : « Ajouté · Ranger » (ouvre la feuille des onglets)
 * ou « Retiré · Annuler » (restaure aussi les onglets).
 */
export function useFavoriteToggle(): (target: FavoriteTarget) => Promise<void> {
  const toggle = useFavoritesStore((s) => s.toggle);
  const showToast = useFavoritesUiStore((s) => s.showToast);
  return useCallback(
    async (target: FavoriteTarget) => {
      const wasFavorite = useFavoritesStore.getState().ids[target.type].has(target.itemId);
      await toggle(target.type, target.itemId);
      showToast(wasFavorite ? { kind: 'removed', title: target.title } : { kind: 'added', target });
    },
    [toggle, showToast],
  );
}
