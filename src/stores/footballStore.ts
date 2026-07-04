import { create } from 'zustand';
import * as settingsRepository from '@/db/repositories/settingsRepository';

/** Preferences football (persistees) : competitions suivies + equipes favorites. */

export interface FavoriteTeam {
  id: number;
  name: string;
}

export interface CompetitionInfo {
  code: string;
  name: string;
  kind: 'national' | 'international';
  country?: string;
}

/** Competitions du palier gratuit football-data (nationales + internationales). */
export const FOOTBALL_COMPETITIONS: CompetitionInfo[] = [
  { code: 'FL1', name: 'Ligue 1', kind: 'national', country: 'France' },
  { code: 'PL', name: 'Premier League', kind: 'national', country: 'Angleterre' },
  { code: 'PD', name: 'Liga', kind: 'national', country: 'Espagne' },
  { code: 'SA', name: 'Serie A', kind: 'national', country: 'Italie' },
  { code: 'BL1', name: 'Bundesliga', kind: 'national', country: 'Allemagne' },
  { code: 'PPL', name: 'Primeira Liga', kind: 'national', country: 'Portugal' },
  { code: 'DED', name: 'Eredivisie', kind: 'national', country: 'Pays-Bas' },
  { code: 'ELC', name: 'Championship', kind: 'national', country: 'Angleterre' },
  { code: 'BSA', name: 'Brasileirão', kind: 'national', country: 'Brésil' },
  { code: 'CL', name: 'Ligue des Champions', kind: 'international' },
  { code: 'EC', name: "Championnat d'Europe", kind: 'international' },
  { code: 'WC', name: 'Coupe du Monde', kind: 'international' },
];

const DEFAULT_COMPETITIONS = ['FL1', 'CL'];

interface FootballState {
  competitions: string[];
  favoriteTeams: FavoriteTeam[];
  hydrated: boolean;
  hydrate: () => Promise<void>;
  toggleCompetition: (code: string) => Promise<void>;
  toggleFavoriteTeam: (team: FavoriteTeam) => Promise<void>;
  isFavorite: (id: number) => boolean;
}

export const useFootballStore = create<FootballState>()((set, get) => ({
  competitions: DEFAULT_COMPETITIONS,
  favoriteTeams: [],
  hydrated: false,

  hydrate: async () => {
    const [comps, favs] = await Promise.all([
      settingsRepository.getSetting<string[]>('footballCompetitions'),
      settingsRepository.getSetting<FavoriteTeam[]>('footballFavoriteTeams'),
    ]);
    set({
      competitions: Array.isArray(comps) ? comps : DEFAULT_COMPETITIONS,
      favoriteTeams: Array.isArray(favs) ? favs : [],
      hydrated: true,
    });
  },

  toggleCompetition: async (code) => {
    const current = get().competitions;
    const next = current.includes(code) ? current.filter((c) => c !== code) : [...current, code];
    set({ competitions: next });
    await settingsRepository.setSetting('footballCompetitions', next);
  },

  toggleFavoriteTeam: async (team) => {
    const current = get().favoriteTeams;
    const next = current.some((t) => t.id === team.id)
      ? current.filter((t) => t.id !== team.id)
      : [...current, team];
    set({ favoriteTeams: next });
    await settingsRepository.setSetting('footballFavoriteTeams', next);
  },

  isFavorite: (id) => get().favoriteTeams.some((t) => t.id === id),
}));
