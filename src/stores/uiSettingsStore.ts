import { create } from 'zustand';
import * as settingsRepository from '@/db/repositories/settingsRepository';

/** Préférences d'affichage légères (persistées dans la table settings). */

/** Langue/variante audio preferee (VF par defaut). */
export type PreferredLanguage = 'VF' | 'VOSTFR' | 'MULTI' | 'EN' | 'ES' | 'DE' | 'IT' | 'PT';

interface UiSettingsState {
  showVlcButton: boolean;
  preferredLanguage: PreferredLanguage;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setShowVlcButton: (value: boolean) => Promise<void>;
  setPreferredLanguage: (value: PreferredLanguage) => Promise<void>;
}

export const useUiSettingsStore = create<UiSettingsState>()((set) => ({
  showVlcButton: false,
  preferredLanguage: 'VF',
  hydrated: false,

  hydrate: async () => {
    const [vlc, lang] = await Promise.all([
      settingsRepository.getSetting<boolean>('showVlcButton'),
      settingsRepository.getSetting<PreferredLanguage>('preferredLanguage'),
    ]);
    set({ showVlcButton: vlc === true, preferredLanguage: lang ?? 'VF', hydrated: true });
  },

  setShowVlcButton: async (value) => {
    await settingsRepository.setSetting('showVlcButton', value);
    set({ showVlcButton: value });
  },

  setPreferredLanguage: async (value) => {
    await settingsRepository.setSetting('preferredLanguage', value);
    set({ preferredLanguage: value });
  },
}));
