import { create } from 'zustand';
import * as playbackRepository from '@/db/repositories/playbackRepository';
import type { MediaType, PlaybackEntry } from '@/types/models';

/**
 * Historique & reprise. Seules les listes des rails vivent en memoire ;
 * les ecritures de progression sont throttlees (le player envoie souvent).
 */

const WRITE_INTERVAL_MS = 4000;
const FINISH_RATIO = 0.92;
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

interface PlaybackState {
  continueWatching: PlaybackEntry[];
  recentChannels: PlaybackEntry[];
  hydrateRails: () => Promise<void>;
  saveProgress: (input: SaveProgressInput, opts?: { force?: boolean }) => void;
  recordLiveWatch: (channelId: string, name: string, logoUrl: string | null) => void;
  markFinished: (type: MediaType, itemId: string) => Promise<void>;
  removeEntry: (type: MediaType, itemId: string) => Promise<void>;
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
    lastWriteByKey.set(key, now);
    const finished =
      input.durationSec !== null &&
      input.durationSec > 0 &&
      input.positionSec / input.durationSec >= FINISH_RATIO;
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
    void playbackRepository.upsertProgress({
      type: 'live',
      itemId: channelId,
      seriesId: null,
      positionSec: 0,
      durationSec: null,
      finished: 0,
      updatedAt: Date.now(),
      label: name,
      posterUrl: logoUrl,
    });
  },

  markFinished: async (type, itemId) => {
    await playbackRepository.markFinished(type, itemId);
    await get().hydrateRails();
  },

  removeEntry: async (type, itemId) => {
    await playbackRepository.removeProgress(type, itemId);
    await get().hydrateRails();
  },

  clearHistory: async () => {
    await playbackRepository.clearHistory();
    lastWriteByKey.clear();
    set({ continueWatching: [], recentChannels: [] });
  },
}));
