import { create } from 'zustand';
import * as settingsRepository from '@/db/repositories/settingsRepository';
import { regroupAll } from '@/services/catalog/catalogGroupingService';
import type { PreferredLanguage } from '@/types/mediaLanguage';

/** Préférences d'affichage légères (persistées dans la table settings). */

export type { PreferredLanguage };

interface UiSettingsState {
  showVlcButton: boolean;
  /** Langue/variante audio preferee (VF par defaut). Voir types/mediaLanguage. */
  preferredLanguage: PreferredLanguage;
  /** Incrustation automatique (PiP) quand on quitte l'app pendant la lecture. */
  autoPip: boolean;
  /** Vrai pendant le re-classement des versions apres changement de langue preferee. */
  regrouping: boolean;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setShowVlcButton: (value: boolean) => Promise<void>;
  setPreferredLanguage: (value: PreferredLanguage) => Promise<void>;
  setAutoPip: (value: boolean) => Promise<void>;
}

export const useUiSettingsStore = create<UiSettingsState>()((set) => ({
  showVlcButton: false,
  preferredLanguage: 'VF',
  autoPip: true,
  regrouping: false,
  hydrated: false,

  hydrate: async () => {
    const [vlc, lang, pip] = await Promise.all([
      settingsRepository.getSetting<boolean>('showVlcButton'),
      settingsRepository.getSetting<PreferredLanguage>('preferredLanguage'),
      settingsRepository.getSetting<boolean>('autoPip'),
    ]);
    set({
      showVlcButton: vlc === true,
      preferredLanguage: lang ?? 'VF',
      autoPip: pip !== false, // defaut ON
      hydrated: true,
    });
  },

  setShowVlcButton: async (value) => {
    await settingsRepository.setSetting('showVlcButton', value);
    set({ showVlcButton: value });
  },

  /**
   * La preference change la VERSION REPRESENTATIVE de chaque titre (groupRank) :
   * on re-classe films + series en tache de fond (quelques secondes sur un gros
   * catalogue). L'UI lit `regrouping` pour l'indiquer.
   */
  setPreferredLanguage: async (value) => {
    await settingsRepository.setSetting('preferredLanguage', value);
    set({ preferredLanguage: value, regrouping: true });
    try {
      await regroupAll(value);
    } catch {
      // Best-effort : les rangs precedents restent valides (juste moins pertinents).
    } finally {
      set({ regrouping: false });
    }
  },

  setAutoPip: async (value) => {
    await settingsRepository.setSetting('autoPip', value);
    set({ autoPip: value });
  },
}));
