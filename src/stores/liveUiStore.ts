import { create } from 'zustand';
import type { LiveViewId } from '@/services/live/liveViews';

/**
 * Etat d'affichage de la page Live conserve le temps de la session : revenir
 * d'une chaine retrouve la meme vue, la meme recherche et la meme position
 * (la page est demontee pendant la lecture). En memoire seulement — la vue
 * par defaut au lancement reste celle memorisee dans les reglages.
 */
interface LiveUiState {
  view: LiveViewId | null;
  query: string;
  visible: number;
  scrollY: number;
  save: (state: { view: LiveViewId; query: string; visible: number; scrollY: number }) => void;
}

export const useLiveUiStore = create<LiveUiState>((set) => ({
  view: null,
  query: '',
  visible: 0,
  scrollY: 0,
  save: (state) => set(state),
}));
