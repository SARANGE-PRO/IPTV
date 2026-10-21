import { create } from 'zustand';
import type { CatalogFilter, FlatSort, LaneFilter } from '@/db/repositories/catalogRepository';
import * as settingsRepository from '@/db/repositories/settingsRepository';
import { ensureGenres } from '@/services/tmdb/tmdbGenreService';

/**
 * Etat de filtrage FRONTEND de la VOD (refonte, etape 4 ; chantier 1 : pill de
 * langue). Navigation a plat sur toute la collection : pill de langue
 * (Tout / VF / VOSTFR / VO), tri global, genres TMDB, bornes annee/note, PAR
 * SECTION (Films = 'vod', Series = 'series').
 *
 * Perimetre volontairement limite (les etats a CONSERVER restent ailleurs) :
 *  - blacklist categories        -> filterStore (inchange) ;
 *  - langue preferee VF/VOSTFR   -> uiSettingsStore (ordre des tiers « Tout ») ;
 *  - etat de sync / backfill      -> catalogStore (inchange).
 * Le tri et la pill de langue sont memorises ; les autres filtres sont
 * transitoires (une session de navigation).
 */

export type VodSection = 'vod' | 'series';

export interface Genre {
  id: number;
  name: string;
}

/** Filtres d'une section. `genreMatch` : 'any' = OU (defaut), 'all' = ET. */
export interface SectionFilters {
  sort: FlatSort;
  lane: LaneFilter;
  genreIds: number[];
  genreMatch: 'any' | 'all';
  minYear: number | null;
  maxYear: number | null;
  minRating: number | null;
  unclassifiedOnly: boolean;
}

const defaultFilters = (): SectionFilters => ({
  sort: 'recent',
  lane: 'all',
  genreIds: [],
  genreMatch: 'any',
  minYear: null,
  maxYear: null,
  minRating: null,
  unclassifiedOnly: false,
});

const sortSettingKey = (section: VodSection): string => `vodSort:${section}`;
const laneSettingKey = (section: VodSection): string => `vodLane:${section}`;
const genreType = (section: VodSection): 'movie' | 'tv' => (section === 'vod' ? 'movie' : 'tv');

const LANES: readonly LaneFilter[] = ['all', 'fr', 'vost', 'vo', 'other'];
const isLane = (value: unknown): value is LaneFilter => LANES.includes(value as LaneFilter);

interface VodFilterState {
  filters: Record<VodSection, SectionFilters>;
  genres: Record<VodSection, Genre[]>;
  genresLoaded: Record<VodSection, boolean>;
  hydrated: boolean;

  /** Charge les tris / pills memorises (Dexie). Ne touche pas au reseau. */
  hydrate: () => Promise<void>;
  /** Charge la liste des genres TMDB d'une section (pour les pills). Idempotent. */
  loadGenres: (section: VodSection) => Promise<void>;

  setSort: (section: VodSection, sort: FlatSort) => void;
  setLane: (section: VodSection, lane: LaneFilter) => void;
  toggleGenre: (section: VodSection, id: number) => void;
  setGenres: (section: VodSection, ids: number[]) => void;
  clearGenres: (section: VodSection) => void;
  setGenreMatch: (section: VodSection, match: 'any' | 'all') => void;
  setYearRange: (section: VodSection, min: number | null, max: number | null) => void;
  setMinRating: (section: VodSection, rating: number | null) => void;
  setUnclassifiedOnly: (section: VodSection, value: boolean) => void;
  resetFilters: (section: VodSection) => void;

  /** Traduit l'etat d'une section en CatalogFilter pour le repository (getAll*Page / search*Filtered). */
  buildFilter: (section: VodSection) => CatalogFilter;
  /** Vrai si au moins un filtre (hors tri et pill de langue) est actif. */
  hasActiveFilter: (section: VodSection) => boolean;
}

export const useVodFilterStore = create<VodFilterState>()((set, get) => {
  /** Applique un patch immuable aux filtres d'une section. */
  const patch = (section: VodSection, partial: Partial<SectionFilters>): void => {
    set((state) => ({
      filters: { ...state.filters, [section]: { ...state.filters[section], ...partial } },
    }));
  };

  return {
    filters: { vod: defaultFilters(), series: defaultFilters() },
    genres: { vod: [], series: [] },
    genresLoaded: { vod: false, series: false },
    hydrated: false,

    hydrate: async () => {
      const [vodSort, seriesSort, vodLane, seriesLane] = await Promise.all([
        settingsRepository.getSetting<FlatSort>(sortSettingKey('vod')),
        settingsRepository.getSetting<FlatSort>(sortSettingKey('series')),
        settingsRepository.getSetting<unknown>(laneSettingKey('vod')),
        settingsRepository.getSetting<unknown>(laneSettingKey('series')),
      ]);
      set((state) => ({
        filters: {
          vod: {
            ...state.filters.vod,
            sort: vodSort ?? state.filters.vod.sort,
            lane: isLane(vodLane) ? vodLane : state.filters.vod.lane,
          },
          series: {
            ...state.filters.series,
            sort: seriesSort ?? state.filters.series.sort,
            lane: isLane(seriesLane) ? seriesLane : state.filters.series.lane,
          },
        },
        hydrated: true,
      }));
    },

    loadGenres: async (section) => {
      if (get().genresLoaded[section]) return;
      const map = await ensureGenres(genreType(section));
      const list: Genre[] = [...map.entries()]
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
      set((state) => ({
        genres: { ...state.genres, [section]: list },
        genresLoaded: { ...state.genresLoaded, [section]: true },
      }));
    },

    setSort: (section, sort) => {
      patch(section, { sort });
      void settingsRepository.setSetting(sortSettingKey(section), sort);
    },

    setLane: (section, lane) => {
      patch(section, { lane });
      void settingsRepository.setSetting(laneSettingKey(section), lane);
    },

    toggleGenre: (section, id) => {
      const current = get().filters[section].genreIds;
      const next = current.includes(id) ? current.filter((g) => g !== id) : [...current, id];
      patch(section, { genreIds: next });
    },

    setGenres: (section, ids) => patch(section, { genreIds: [...ids] }),
    clearGenres: (section) => patch(section, { genreIds: [] }),
    setGenreMatch: (section, match) => patch(section, { genreMatch: match }),
    setYearRange: (section, min, max) => patch(section, { minYear: min, maxYear: max }),
    setMinRating: (section, rating) => patch(section, { minRating: rating }),
    setUnclassifiedOnly: (section, value) => patch(section, { unclassifiedOnly: value }),

    resetFilters: (section) => {
      // Conserve le tri et la pill de langue (preferences memorisees), remet les filtres a zero.
      const { sort, lane } = get().filters[section];
      set((state) => ({
        filters: { ...state.filters, [section]: { ...defaultFilters(), sort, lane } },
      }));
    },

    buildFilter: (section) => {
      const f = get().filters[section];
      const cf: CatalogFilter = {};
      if (f.genreIds.length > 0) {
        cf.genreIds = f.genreIds;
        cf.genreMatch = f.genreMatch;
      }
      if (f.minYear !== null) cf.minYear = f.minYear;
      if (f.maxYear !== null) cf.maxYear = f.maxYear;
      if (f.minRating !== null) cf.minRating = f.minRating;
      if (f.unclassifiedOnly) cf.unclassifiedOnly = true;
      return cf;
    },

    hasActiveFilter: (section) => {
      const f = get().filters[section];
      return (
        f.genreIds.length > 0 || f.minYear !== null || f.maxYear !== null || f.minRating !== null || f.unclassifiedOnly
      );
    },
  };
});
