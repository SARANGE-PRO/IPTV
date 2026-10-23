import { create } from 'zustand';
import type { MediaType } from '@/types/models';

/**
 * Etat d'INTERFACE des favoris, partage par toute l'app : la feuille
 * « Ranger dans un onglet » et le toast de confirmation (Annuler / Ranger).
 * Les donnees restent dans favoritesStore.
 */

export interface FavoriteTarget {
  type: MediaType;
  itemId: string;
  title: string;
  /** Live : permet « Masquer la catégorie » depuis la feuille. */
  hideCategory?: { categoryId: string; categoryName: string };
}

export type FavoriteToast =
  | { id: number; kind: 'added'; target: FavoriteTarget }
  | { id: number; kind: 'removed'; title: string }
  | { id: number; kind: 'info'; message: string };

type ToastInput =
  | { kind: 'added'; target: FavoriteTarget }
  | { kind: 'removed'; title: string }
  | { kind: 'info'; message: string };

interface FavoritesUiState {
  sheet: FavoriteTarget | null;
  toast: FavoriteToast | null;
  openSheet: (target: FavoriteTarget) => void;
  closeSheet: () => void;
  showToast: (toast: ToastInput) => void;
  dismissToast: (id?: number) => void;
}

let nextToastId = 1;

export const useFavoritesUiStore = create<FavoritesUiState>()((set, get) => ({
  sheet: null,
  toast: null,
  openSheet: (target) => set({ sheet: target, toast: null }),
  closeSheet: () => set({ sheet: null }),
  showToast: (toast) => set({ toast: { ...toast, id: nextToastId++ } as FavoriteToast }),
  dismissToast: (id) => {
    if (id === undefined || get().toast?.id === id) set({ toast: null });
  },
}));
