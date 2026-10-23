import { create } from 'zustand';
import * as settingsRepository from '@/db/repositories/settingsRepository';
import { regroupAll } from '@/services/catalog/catalogGroupingService';
import type { PreferredLanguage } from '@/types/mediaLanguage';

/** Préférences d'affichage légères (persistées dans la table settings). */

export type { PreferredLanguage };

interface UiSettingsState {
  showVlcButton: boolean;
  /** Bouton « Diffuser sur la TV » (ouvre VLC, qui caste) — visible par defaut. */
  showCastButton: boolean;
  /** Guide « comment caster depuis VLC » deja vu : le bouton ouvre VLC directement. */
  castHintSeen: boolean;
  /** Image dans l'image (PiP) autorisee : bouton dedie + PiP auto du plein ecran iOS. */
  pipEnabled: boolean;
  /** Langue/variante audio preferee (VF par defaut). Voir types/mediaLanguage. */
  preferredLanguage: PreferredLanguage;
  /** Vrai pendant le re-classement des versions apres changement de langue preferee. */
  regrouping: boolean;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setShowVlcButton: (value: boolean) => Promise<void>;
  setShowCastButton: (value: boolean) => Promise<void>;
  markCastHintSeen: () => Promise<void>;
  setPipEnabled: (value: boolean) => Promise<void>;
  setPreferredLanguage: (value: PreferredLanguage) => Promise<void>;
}

export const useUiSettingsStore = create<UiSettingsState>()((set) => ({
  showVlcButton: false,
  showCastButton: true,
  castHintSeen: false,
  pipEnabled: true,
  preferredLanguage: 'VF',
  regrouping: false,
  hydrated: false,

  hydrate: async () => {
    const [vlc, lang, cast, castHint, pip] = await Promise.all([
      settingsRepository.getSetting<boolean>('showVlcButton'),
      settingsRepository.getSetting<PreferredLanguage>('preferredLanguage'),
      settingsRepository.getSetting<boolean>('showCastButton'),
      settingsRepository.getSetting<boolean>('castHintSeen'),
      settingsRepository.getSetting<boolean>('pipEnabled'),
    ]);
    set({
      showVlcButton: vlc === true,
      showCastButton: cast !== false,
      castHintSeen: castHint === true,
      pipEnabled: pip !== false,
      preferredLanguage: lang ?? 'VF',
      hydrated: true,
    });
  },

  setShowVlcButton: async (value) => {
    await settingsRepository.setSetting('showVlcButton', value);
    set({ showVlcButton: value });
  },

  setShowCastButton: async (value) => {
    await settingsRepository.setSetting('showCastButton', value);
    set({ showCastButton: value });
  },

  setPipEnabled: async (value) => {
    await settingsRepository.setSetting('pipEnabled', value);
    set({ pipEnabled: value });
  },

  markCastHintSeen: async () => {
    set({ castHintSeen: true });
    await settingsRepository.setSetting('castHintSeen', true);
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
}));
