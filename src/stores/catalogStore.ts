import { create } from 'zustand';
import { SECTIONS } from '@/config/constants';
import * as catalogRepository from '@/db/repositories/catalogRepository';
import * as syncMetadataRepository from '@/db/repositories/syncMetadataRepository';
import * as catalogSyncService from '@/services/sync/catalogSyncService';
import type { LoadState } from '@/types';
import type { Category, Section } from '@/types/models';
import type { XtreamCredentials } from '@/types/xtream';
import { sortFrenchFirst } from '@/utils/frenchDetection';

/**
 * Etat catalogue : CATEGORIES + metadonnees de sync uniquement. Les listes
 * lourdes (chaines/films/series) restent dans Dexie, lues a la demande.
 */

export interface CatalogSectionState {
  categories: Category[];
  status: LoadState;
  itemCount: number;
  lastFetchAt: number | null;
  error: string | null;
}

const emptySection = (): CatalogSectionState => ({
  categories: [],
  status: 'idle',
  itemCount: 0,
  lastFetchAt: null,
  error: null,
});

interface CatalogState {
  sections: Record<Section, CatalogSectionState>;
  syncing: boolean;
  hydrated: boolean;
  hydrateSection: (section: Section) => Promise<void>;
  hydrate: () => Promise<void>;
  sync: (creds: XtreamCredentials, opts?: { force?: boolean }) => Promise<boolean>;
  reset: () => void;
}

export const useCatalogStore = create<CatalogState>()((set, get) => ({
  sections: { live: emptySection(), vod: emptySection(), series: emptySection() },
  syncing: false,
  hydrated: false,

  hydrateSection: async (section) => {
    const [categories, meta] = await Promise.all([
      catalogRepository.getCategories(section),
      syncMetadataRepository.getSyncMetadata(section),
    ]);
    const sorted = sortFrenchFirst(categories);
    let status: LoadState;
    if (meta.status === 'syncing') status = 'loading';
    else if (sorted.length > 0) status = 'ready';
    else if (meta.status === 'error') status = 'error';
    else if (meta.lastFetchAt !== null) status = 'empty';
    else status = 'idle';

    set((state) => ({
      sections: {
        ...state.sections,
        [section]: {
          categories: sorted,
          status,
          itemCount: meta.itemCount,
          lastFetchAt: meta.lastFetchAt,
          error: meta.error,
        },
      },
    }));
  },

  hydrate: async () => {
    await Promise.all(SECTIONS.map((section) => get().hydrateSection(section)));
    set({ hydrated: true });
  },

  sync: async (creds, opts) => {
    if (get().syncing) return false;
    set((state) => ({
      syncing: true,
      sections: {
        live: { ...state.sections.live, status: 'loading', error: null },
        vod: { ...state.sections.vod, status: 'loading', error: null },
        series: { ...state.sections.series, status: 'loading', error: null },
      },
    }));

    const outcomes = await catalogSyncService.syncAllSections(creds, {
      force: opts?.force ?? false,
      onSectionDone: (outcome) => {
        void get().hydrateSection(outcome.section);
      },
    });

    await get().hydrate();
    set({ syncing: false });
    return outcomes.every((o) => o.ok);
  },

  reset: () => {
    set({
      sections: { live: emptySection(), vod: emptySection(), series: emptySection() },
      syncing: false,
      hydrated: false,
    });
  },
}));
