import { create } from 'zustand';
import * as settingsRepository from '@/db/repositories/settingsRepository';

/** Préférences d'affichage légères (persistées dans la table settings). */

interface UiSettingsState {
  showVlcButton: boolean;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setShowVlcButton: (value: boolean) => Promise<void>;
}

export const useUiSettingsStore = create<UiSettingsState>()((set) => ({
  showVlcButton: false,
  hydrated: false,

  hydrate: async () => {
    const value = await settingsRepository.getSetting<boolean>('showVlcButton');
    set({ showVlcButton: value === true, hydrated: true });
  },

  setShowVlcButton: async (value) => {
    await settingsRepository.setSetting('showVlcButton', value);
    set({ showVlcButton: value });
  },
}));
