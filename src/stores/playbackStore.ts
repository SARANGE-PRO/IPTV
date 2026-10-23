import { create } from 'zustand';
import * as playbackRepository from '@/db/repositories/playbackRepository';
import { dismissContinue, type DismissTarget } from '@/services/home/continueWatchingService';
import { FINISHED_RATIO } from '@/services/player/resumePlaybackService';
import type { MediaType, PlaybackEntry } from '@/types/models';

/**
 * Historique & reprise. Seules les listes des rails vivent en memoire ;
 * les ecritures de progression sont throttlees (le player envoie souvent).
 */

const WRITE_INTERVAL_MS = 4000;
/** Borne la Map de throttle sur une longue session (1 entree par item lu). */
const MAX_THROTTLE_KEYS = 500;
const lastWriteByKey = new Map<string, number>();

export interface SaveProgressInput {
  type: MediaType;
  itemId: string;
  seriesId?: string | null;
  positionSec: number;
  durationSec: number | null;
  label: string | null;
  posterUrl: string | null;
}

export interface SetWatchedInput {
  type: 'vod' | 'episode';
  seriesId: string | null;
  items: { itemId: string; durationSec: number | null; label: string | null }[];
  posterUrl: string | null;
}

interface PlaybackState {
  continueWatching: PlaybackEntry[];
  recentChannels: PlaybackEntry[];
  hydrateRails: () => Promise<void>;
  saveProgress: (input: SaveProgressInput, opts?: { force?: boolean }) => void;
  recordLiveWatch: (channelId: string, name: string, logoUrl: string | null) => void;
  markFinished: (type: MediaType, itemId: string) => Promise<void>;
  removeEntry: (type: MediaType, itemId: string) => Promise<void>;
  /** Marque des episodes (ou un film) comme vus / non vus. */
  setWatched: (input: SetWatchedInput, watched: boolean) => Promise<void>;
  /** Retire une carte de « Continuer a regarder » (progression conservee). */
  dismissContinue: (target: DismissTarget) => Promise<void>;
  clearHistory: () => Promise<void>;
}

export const usePlaybackStore = create<PlaybackState>()((set, get) => ({
  continueWatching: [],
  recentChannels: [],

  hydrateRails: async () => {
    const [continueWatching, recentChannels] = await Promise.all([
      playbackRepository.getContinueWatching(15),
      playbackRepository.getRecentLiveChannels(12),
    ]);
    set({ continueWatching, recentChannels });
  },

  saveProgress: (input, opts) => {
    const key = `${input.type}:${input.itemId}`;
    const now = Date.now();
    const last = lastWriteByKey.get(key) ?? 0;
    if (!(opts?.force ?? false) && now - last < WRITE_INTERVAL_MS) return;
    if (lastWriteByKey.size > MAX_THROTTLE_KEYS) lastWriteByKey.clear();
    lastWriteByKey.set(key, now);
    const finished =
      input.durationSec !== null &&
      input.durationSec > 0 &&
      input.positionSec / input.durationSec >= FINISHED_RATIO;
    void playbackRepository.upsertProgress({
      type: input.type,
      itemId: input.itemId,
      seriesId: input.seriesId ?? null,
      positionSec: Math.floor(input.positionSec),
      durationSec: input.durationSec,
      finished: finished ? 1 : 0,
      updatedAt: now,
      label: input.label,
      posterUrl: input.posterUrl,
    });
  },

  recordLiveWatch: (channelId, name, logoUrl) => {
    void playbackRepository
      .upsertProgress({
        type: 'live',
        itemId: channelId,
        seriesId: null,
        positionSec: 0,
        durationSec: null,
        finished: 0,
        updatedAt: Date.now(),
        label: name,
        posterUrl: logoUrl,
      })
      // Bandeau « Récemment regardées » du Live : a jour des le retour.
      .then(() => playbackRepository.getRecentLiveChannels(12))
      .then((recentChannels) => set({ recentChannels }))
      .catch(() => undefined);
  },

  markFinished: async (type, itemId) => {
    await playbackRepository.markFinished(type, itemId);
    await get().hydrateRails();
  },

  removeEntry: async (type, itemId) => {
    await playbackRepository.removeProgress(type, itemId);
    await get().hydrateRails();
  },

  setWatched: async (input, watched) => {
    if (watched) {
      const now = Date.now();
      await playbackRepository.markWatched(
        input.items.map((it, i) => ({
          type: input.type,
          itemId: it.itemId,
          seriesId: input.seriesId,
          positionSec: it.durationSec ?? 0,
          durationSec: it.durationSec,
          finished: 1,
          // Ordre conserve : le dernier de la liste devient le plus recent.
          updatedAt: now + i,
          label: it.label,
          posterUrl: input.posterUrl,
        })),
      );
    } else {
      await playbackRepository.markUnwatched(input.type, input.items.map((it) => it.itemId));
    }
    await get().hydrateRails();
  },

  dismissContinue: async (target) => {
    await dismissContinue(target);
    await get().hydrateRails();
  },

  clearHistory: async () => {
    await playbackRepository.clearHistory();
    lastWriteByKey.clear();
    set({ continueWatching: [], recentChannels: [] });
  },
}));
