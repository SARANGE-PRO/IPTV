import { create } from 'zustand';
import { SECTIONS } from '@/config/constants';
import * as catalogRepository from '@/db/repositories/catalogRepository';
import * as syncMetadataRepository from '@/db/repositories/syncMetadataRepository';
import * as catalogSyncService from '@/services/sync/catalogSyncService';
import { isBackfillRunning, runCatalogBackfill } from '@/services/tmdb/tmdbEnrichmentService';
import type { LoadState } from '@/types';
import type { Category, Section } from '@/types/models';
import type { XtreamCredentials } from '@/types/xtream';
import { sortFrenchFirst } from '@/utils/frenchDetection';

/**
 * Etat catalogue : CATEGORIES + metadonnees de sync uniquement. Les listes
 * lourdes (chaines/films/series) restent dans Dexie, lues a la demande.
 * Porte aussi l'etat du BACKFILL TMDB (chantier 3) : lance au demarrage et
 * apres chaque sync, progression visible dans les reglages.
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

/** Etat de progression d'une section pendant la synchronisation. */
export type SyncSectionState = 'pending' | 'loading' | 'done' | 'skipped' | 'error';

const idleProgress = (): Record<Section, SyncSectionState> => ({
  live: 'pending',
  vod: 'pending',
  series: 'pending',
});

export interface BackfillState {
  running: boolean;
  /** Films / series restant a enrichir (null = pas encore compte). */
  moviesLeft: number | null;
  seriesLeft: number | null;
  /** Enrichis durant le run courant. */
  processed: number;
}

const idleBackfill = (): BackfillState => ({ running: false, moviesLeft: null, seriesLeft: null, processed: 0 });

interface CatalogState {
  sections: Record<Section, CatalogSectionState>;
  syncing: boolean;
  /** Synchro automatique de fond : la banniere demarre reduite. */
  syncQuiet: boolean;
  syncProgress: Record<Section, SyncSectionState>;
  syncCounts: Record<Section, number>;
  backfill: BackfillState;
  hydrated: boolean;
  hydrateSection: (section: Section) => Promise<void>;
  hydrate: () => Promise<void>;
  sync: (creds: XtreamCredentials, opts?: { force?: boolean; quiet?: boolean }) => Promise<boolean>;
  /** Compte les lignes en attente d'enrichissement (affichage reglages). */
  refreshBackfillCounts: () => Promise<void>;
  /** Lance (ou laisse tourner) le backfill TMDB en tache de fond. Idempotent. */
  startBackfill: () => Promise<void>;
  reset: () => void;
}

export const useCatalogStore = create<CatalogState>()((set, get) => ({
  sections: { live: emptySection(), vod: emptySection(), series: emptySection() },
  syncing: false,
  syncQuiet: false,
  syncProgress: idleProgress(),
  syncCounts: { live: 0, vod: 0, series: 0 },
  backfill: idleBackfill(),
  hydrated: false,

  hydrateSection: async (section) => {
    const [categories, meta] = await Promise.all([
      catalogRepository.getCategories(section),
      syncMetadataRepository.getSyncMetadata(section),
    ]);
    const sorted = sortFrenchFirst(categories);
    let status: LoadState;
    // `meta.status:'syncing'` n'est fiable QUE si une sync tourne vraiment dans
    // cette session (get().syncing). Sinon c'est un statut orphelin (onglet
    // ferme pendant une sync) : on l'ignore et on statue sur les donnees reelles,
    // sinon le spinner reste fige ET le CTA "Synchroniser" est masque a tort.
    if (meta.status === 'syncing' && get().syncing) status = 'loading';
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
      syncQuiet: opts?.quiet ?? false,
      syncProgress: idleProgress(),
      syncCounts: { live: 0, vod: 0, series: 0 },
      sections: {
        live: { ...state.sections.live, status: 'loading', error: null },
        vod: { ...state.sections.vod, status: 'loading', error: null },
        series: { ...state.sections.series, status: 'loading', error: null },
      },
    }));

    let outcomes: catalogSyncService.SectionOutcome[] | null = null;
    try {
      outcomes = await catalogSyncService.syncAllSections(creds, {
        force: opts?.force ?? false,
        onSectionStart: (section) => {
          set((state) => ({ syncProgress: { ...state.syncProgress, [section]: 'loading' } }));
        },
        onSectionDone: (outcome) => {
          set((state) => ({
            syncProgress: {
              ...state.syncProgress,
              [outcome.section]: outcome.ok ? (outcome.skipped ? 'skipped' : 'done') : 'error',
            },
            syncCounts: { ...state.syncCounts, [outcome.section]: outcome.itemCount },
          }));
          void get().hydrateSection(outcome.section);
        },
      });
    } catch {
      // Exception imprevue (quota plein, base fermee...) : synchro en echec,
      // les statuts sont relus depuis la base ci-dessous.
    }

    try {
      await get().hydrate();
    } catch {
      // Base illisible : aucune section ne doit rester bloquee sur « chargement ».
      set((state) => ({
        sections: Object.fromEntries(
          SECTIONS.map((section) => {
            const current = state.sections[section];
            return [
              section,
              current.status === 'loading'
                ? { ...current, status: 'error', error: 'Lecture du catalogue impossible.' }
                : current,
            ];
          }),
        ) as Record<Section, CatalogSectionState>,
      }));
    } finally {
      // TOUJOURS libere : sinon plus aucune synchro possible jusqu'au redemarrage.
      set({ syncing: false });
    }

    if (outcomes === null) return false;
    // Enrichissement TMDB en tache de fond (reprend la ou il s'etait arrete).
    void get().startBackfill();
    return outcomes.every((o) => o.ok);
  },

  refreshBackfillCounts: async () => {
    const [moviesLeft, seriesLeft] = await Promise.all([
      catalogRepository.countMoviesNeedingTmdb(),
      catalogRepository.countSeriesNeedingTmdb(),
    ]);
    set((state) => ({ backfill: { ...state.backfill, moviesLeft, seriesLeft } }));
  },

  startBackfill: async () => {
    if (isBackfillRunning() || get().backfill.running) return;
    await get().refreshBackfillCounts();
    const { moviesLeft, seriesLeft } = get().backfill;
    if ((moviesLeft ?? 0) + (seriesLeft ?? 0) === 0) return;
    set((state) => ({ backfill: { ...state.backfill, running: true, processed: 0 } }));
    try {
      await runCatalogBackfill({
        onProgress: (p) => {
          set({ backfill: { running: true, moviesLeft: p.moviesLeft, seriesLeft: p.seriesLeft, processed: p.processed } });
        },
      });
    } catch {
      // Best-effort : l'etat vit dans Dexie, le prochain lancement reprendra.
    } finally {
      set((state) => ({ backfill: { ...state.backfill, running: false } }));
      void get().refreshBackfillCounts();
    }
  },

  reset: () => {
    set({
      sections: { live: emptySection(), vod: emptySection(), series: emptySection() },
      syncing: false,
      backfill: idleBackfill(),
      hydrated: false,
    });
  },
}));
