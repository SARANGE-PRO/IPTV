import { create } from 'zustand';
import { DEFAULT_COUNTRY, DEFAULT_LANGUAGE } from '@/config/constants';
import * as hiddenCategoriesRepository from '@/db/repositories/hiddenCategoriesRepository';
import * as settingsRepository from '@/db/repositories/settingsRepository';
import type { Section } from '@/types/models';

/**
 * Recherche + filtres. Deux leviers distincts : le pays (temporaire,
 * priorisation) et la blacklist (masquage durable, reactivable).
 * Les defauts pays/langue sont persistes dans la table settings.
 */

const DEBOUNCE_MS = 250;
let debounceTimer: ReturnType<typeof setTimeout> | undefined;

interface FilterState {
  query: string;
  debouncedQuery: string;
  country: string;
  language: string | null;
  hidden: Record<Section, Set<string>>;
  hiddenHydrated: boolean;
  setQuery: (q: string) => void;
  clearQuery: () => void;
  setCountry: (country: string) => void;
  setLanguage: (language: string | null) => void;
  resetToFrance: () => void;
  hydrateDefaults: () => Promise<void>;
  setDefaultCountry: (country: string) => Promise<void>;
  setDefaultLanguage: (language: string | null) => Promise<void>;
  hydrateHidden: () => Promise<void>;
  hideCategory: (section: Section, categoryId: string, label: string) => Promise<void>;
  unhideCategory: (section: Section, categoryId: string) => Promise<void>;
  isHidden: (section: Section, categoryId: string) => boolean;
  resetFilters: () => void;
}

export const useFilterStore = create<FilterState>()((set, get) => ({
  query: '',
  debouncedQuery: '',
  country: DEFAULT_COUNTRY,
  language: DEFAULT_LANGUAGE,
  hidden: { live: new Set<string>(), vod: new Set<string>(), series: new Set<string>() },
  hiddenHydrated: false,

  setQuery: (query) => {
    set({ query });
    if (debounceTimer !== undefined) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => set({ debouncedQuery: query.trim() }), DEBOUNCE_MS);
  },

  clearQuery: () => {
    if (debounceTimer !== undefined) clearTimeout(debounceTimer);
    set({ query: '', debouncedQuery: '' });
  },

  setCountry: (country) => set({ country }),
  setLanguage: (language) => set({ language }),
  resetToFrance: () => set({ country: DEFAULT_COUNTRY, language: DEFAULT_LANGUAGE }),

  hydrateDefaults: async () => {
    const [country, language] = await Promise.all([
      settingsRepository.getSetting<string>('defaultCountry'),
      settingsRepository.getSetting<string | null>('defaultLanguage'),
    ]);
    set({
      country: country ?? DEFAULT_COUNTRY,
      language: language === undefined ? DEFAULT_LANGUAGE : language,
    });
  },

  setDefaultCountry: async (country) => {
    await settingsRepository.setSetting('defaultCountry', country);
    set({ country });
  },

  setDefaultLanguage: async (language) => {
    await settingsRepository.setSetting('defaultLanguage', language);
    set({ language });
  },

  hydrateHidden: async () => {
    const rows = await hiddenCategoriesRepository.getAllHiddenCategories();
    const hidden: Record<Section, Set<string>> = {
      live: new Set<string>(),
      vod: new Set<string>(),
      series: new Set<string>(),
    };
    for (const row of rows) hidden[row.section].add(row.categoryId);
    set({ hidden, hiddenHydrated: true });
  },

  hideCategory: async (section, categoryId, label) => {
    await hiddenCategoriesRepository.hideCategory(section, categoryId, label);
    set((state) => {
      const next = new Set(state.hidden[section]);
      next.add(categoryId);
      return { hidden: { ...state.hidden, [section]: next } };
    });
  },

  unhideCategory: async (section, categoryId) => {
    await hiddenCategoriesRepository.unhideCategory(section, categoryId);
    set((state) => {
      const next = new Set(state.hidden[section]);
      next.delete(categoryId);
      return { hidden: { ...state.hidden, [section]: next } };
    });
  },

  isHidden: (section, categoryId) => get().hidden[section].has(categoryId),

  resetFilters: () => {
    get().clearQuery();
    set({ country: DEFAULT_COUNTRY, language: DEFAULT_LANGUAGE });
  },
}));
