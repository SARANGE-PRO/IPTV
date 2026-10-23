import { create } from 'zustand';
import { ensureFrenchLineup, lineupRevision } from '@/services/live/frenchLineupService';

/**
 * Etat de la grille FR (statut + revision) — JAMAIS les chaines elles-memes,
 * qui restent dans Dexie / le cache du service (invariant 6).
 */

export type LineupStatus = 'idle' | 'building' | 'ready' | 'error';

interface LiveLineupState {
  status: LineupStatus;
  /** Change a chaque reconstruction : les vues relisent la grille. */
  revision: number;
  ensure: () => Promise<void>;
}

export const useLiveLineupStore = create<LiveLineupState>()((set, get) => ({
  status: 'idle',
  revision: 0,

  ensure: async () => {
    // Statut « building » seulement si une reconstruction a vraiment lieu :
    // une verification rapide ne doit pas faire clignoter les squelettes.
    const timer = setTimeout(() => {
      if (get().status !== 'ready') set({ status: 'building' });
    }, 150);
    try {
      await ensureFrenchLineup();
      set({ status: 'ready', revision: lineupRevision() });
    } catch {
      set({ status: 'error' });
    } finally {
      clearTimeout(timer);
    }
  },
}));
