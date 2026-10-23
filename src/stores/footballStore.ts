import { create } from 'zustand';
import {
  DEFAULT_COMPETITION_CODES,
  FOOTBALL_COMPETITIONS,
  LEGACY_COMPETITION_CODES,
  COMPETITION_BY_CODE,
} from '@/config/footballCompetitions';
import * as settingsRepository from '@/db/repositories/settingsRepository';
import type { FavoriteTeam } from '@/types/football';

/** Preferences football (persistees) : competitions suivies + equipes favorites. */

export type { FavoriteTeam };

export { FOOTBALL_COMPETITIONS };

const COMPS_KEY = 'footballCompetitionsV2';
const FAVS_KEY = 'footballFavoriteTeamsV2';

/**
 * Migration v1 (codes football-data, ids numeriques) -> v2 (codes ESPN, ids
 * texte). Les competitions deja suivies sont conservees ET completees par les
 * nouvelles competitions par defaut (Europa, Conference, Coupe de France…),
 * absentes de l'ancienne source.
 */
async function migrate(): Promise<{ competitions: string[]; favorites: FavoriteTeam[] }> {
  const [legacyComps, legacyFavs] = await Promise.all([
    settingsRepository.getSetting<string[]>('footballCompetitions'),
    settingsRepository.getSetting<{ id: number | string; name: string }[]>('footballFavoriteTeams'),
  ]);
  const mapped = (Array.isArray(legacyComps) ? legacyComps : [])
    .map((c) => LEGACY_COMPETITION_CODES.get(c) ?? c)
    .filter((c) => COMPETITION_BY_CODE.has(c));
  const competitions = [...new Set([...mapped, ...DEFAULT_COMPETITION_CODES])];
  const favorites = (Array.isArray(legacyFavs) ? legacyFavs : []).map((f) => ({
    id: typeof f.id === 'number' ? `fd:${f.id}` : f.id,
    name: f.name,
  }));
  await Promise.all([
    settingsRepository.setSetting(COMPS_KEY, competitions),
    settingsRepository.setSetting(FAVS_KEY, favorites),
  ]);
  return { competitions, favorites };
}

interface FootballState {
  competitions: string[];
  favoriteTeams: FavoriteTeam[];
  hydrated: boolean;
  hydrate: () => Promise<void>;
  toggleCompetition: (code: string) => Promise<void>;
  setCompetitions: (codes: string[]) => Promise<void>;
  toggleFavoriteTeam: (team: FavoriteTeam) => Promise<void>;
}

export const useFootballStore = create<FootballState>()((set, get) => ({
  competitions: DEFAULT_COMPETITION_CODES,
  favoriteTeams: [],
  hydrated: false,

  hydrate: async () => {
    const [comps, favs] = await Promise.all([
      settingsRepository.getSetting<string[]>(COMPS_KEY),
      settingsRepository.getSetting<FavoriteTeam[]>(FAVS_KEY),
    ]);
    if (!Array.isArray(comps)) {
      const migrated = await migrate();
      set({ competitions: migrated.competitions, favoriteTeams: migrated.favorites, hydrated: true });
      return;
    }
    set({
      competitions: comps.filter((c) => COMPETITION_BY_CODE.has(c)),
      favoriteTeams: Array.isArray(favs) ? favs : [],
      hydrated: true,
    });
  },

  toggleCompetition: async (code) => {
    const current = get().competitions;
    const next = current.includes(code) ? current.filter((c) => c !== code) : [...current, code];
    set({ competitions: next });
    await settingsRepository.setSetting(COMPS_KEY, next);
  },

  setCompetitions: async (codes) => {
    const next = codes.filter((c) => COMPETITION_BY_CODE.has(c));
    set({ competitions: next });
    await settingsRepository.setSetting(COMPS_KEY, next);
  },

  toggleFavoriteTeam: async (team) => {
    const current = get().favoriteTeams;
    const next = current.some((t) => t.id === team.id)
      ? current.filter((t) => t.id !== team.id)
      : [...current, team];
    set({ favoriteTeams: next });
    await settingsRepository.setSetting(FAVS_KEY, next);
  },
}));
