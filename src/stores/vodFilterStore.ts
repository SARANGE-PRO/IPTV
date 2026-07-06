import { create } from 'zustand';
import type { CatalogFilter, FlatSort } from '@/db/repositories/catalogRepository';
import * as settingsRepository from '@/db/repositories/settingsRepository';
import { ensureGenres } from '@/services/tmdb/tmdbGenreService';

/**
 * Etat de filtrage FRONTEND de la VOD (refonte, etape 4). Remplace la navigation
 * par categories fournisseur : filtres bases sur les metadonnees TMDB (genres,
 * annee, note) appliques a plat sur toute la collection.
 *
 * Perimetre volontairement limite (les etats a CONSERVER restent ailleurs) :
 *  - pays / blacklist categories -> filterStore (inchange) ;
 *  - langue preferee VF/VOSTFR   -> uiSettingsStore (inchange) ;
 *  - etat de sync / backfill      -> catalogStore (inchange).
 * Ici : uniquement le tri, les genres selectionnes et les bornes annee/note, PAR
 * SECTION (Films = 'vod', Series = 'series'). Le tri est memorise ; les filtres
 * sont transitoires (une session de navigation). L'ancienne "categorie
 * selectionnee" (state local de MediaBrowser) disparaitra a l'etape 5 (UI).
 *
 * Ce store N'EST PAS encore branche a l'UI : le cablage se fait a l'etape 5.
 */

export type VodSection = 'vod' | 'series';

export interface Genre {
  id: number;
  name: string;
}

/** Filtres d'une section. `genreMatch` : 'any' = OU (defaut), 'all' = ET. */
export interface SectionFilters {
  sort: FlatSort;
  genreIds: number[];
  genreMatch: 'any' | 'all';
  minYear: number | null;
  maxYear: number | null;
  minRating: number | null;
  frenchOnly: boolean;
  unclassifiedOnly: boolean;
}

const defaultFilters = (): SectionFilters => ({
  sort: 'recent',
  genreIds: [],
  genreMatch: 'any',
  minYear: null,
  maxYear: null,
  minRating: null,
  frenchOnly: false,
  unclassifiedOnly: false,
});

const sortSettingKey = (section: VodSection): string => `vodSort:${section}`;
const genreType = (section: VodSection): 'movie' | 'tv' => (section === 'vod' ? 'movie' : 'tv');

interface VodFilterState {
  filters: Record<VodSection, SectionFilters>;
  genres: Record<VodSection, Genre[]>;
  genresLoaded: Record<VodSection, boolean>;
  hydrated: boolean;

  /** Charge les tris memorises (Dexie). Ne touche pas au reseau. */
  hydrate: () => Promise<void>;
  /** Charge la liste des genres TMDB d'une section (pour les pills). Idempotent. */
  loadGenres: (section: VodSection) => Promise<void>;

  setSort: (section: VodSection, sort: FlatSort) => void;
  toggleGenre: (section: VodSection, id: number) => void;
  setGenres: (section: VodSection, ids: number[]) => void;
  clearGenres: (section: VodSection) => void;
  setGenreMatch: (section: VodSection, match: 'any' | 'all') => void;
  setYearRange: (section: VodSection, min: number | null, max: number | null) => void;
  setMinRating: (section: VodSection, rating: number | null) => void;
  setFrenchOnly: (section: VodSection, value: boolean) => void;
  setUnclassifiedOnly: (section: VodSection, value: boolean) => void;
  resetFilters: (section: VodSection) => void;

  /** Traduit l'etat d'une section en CatalogFilter pour le repository (getAll*Page / search*Filtered). */
  buildFilter: (section: VodSection) => CatalogFilter;
  /** Vrai si au moins un filtre (hors tri) est actif. */
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
      const [vodSort, seriesSort] = await Promise.all([
        settingsRepository.getSetting<FlatSort>(sortSettingKey('vod')),
        settingsRepository.getSetting<FlatSort>(sortSettingKey('series')),
      ]);
      set((state) => ({
        filters: {
          vod: { ...state.filters.vod, sort: vodSort ?? state.filters.vod.sort },
          series: { ...state.filters.series, sort: seriesSort ?? state.filters.series.sort },
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
    setFrenchOnly: (section, value) => patch(section, { frenchOnly: value }),
    setUnclassifiedOnly: (section, value) => patch(section, { unclassifiedOnly: value }),

    resetFilters: (section) => {
      // Conserve le tri (preference memorisee), remet les filtres a zero.
      const sort = get().filters[section].sort;
      set((state) => ({
        filters: { ...state.filters, [section]: { ...defaultFilters(), sort } },
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
      if (f.frenchOnly) cf.frenchOnly = true;
      if (f.unclassifiedOnly) cf.unclassifiedOnly = true;
      return cf;
    },

    hasActiveFilter: (section) => {
      const f = get().filters[section];
      return (
        f.genreIds.length > 0 ||
        f.minYear !== null ||
        f.maxYear !== null ||
        f.minRating !== null ||
        f.frenchOnly ||
        f.unclassifiedOnly
      );
    },
  };
});
