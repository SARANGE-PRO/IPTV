import { describe, expect, it, vi } from 'vitest';
import { nextEpisodeContinuation, type SeriesPlaybackDeps } from '@/services/player/seriesAutoplayService';
import type { Episode } from '@/types/models';

const ep = (id: string, season: number, n: number): Episode => ({
  id,
  seasonNumber: season,
  episodeNumber: n,
  title: `E${n}`,
  containerExtension: 'mp4',
  durationSecs: 2400,
  plot: null,
  imageUrl: null,
});

const episodes = [ep('1', 1, 1), ep('2', 1, 2), ep('3', 2, 1)];
const ctx = {
  credentials: { serverUrl: 'http://srv:8080', username: 'u', password: 'p' },
  seriesId: '201',
  seriesName: 'FR - La Série',
  seriesTitle: 'La Série',
  posterUrl: null,
  episodes,
};

function deps(keys: (string | null)[]): SeriesPlaybackDeps & { play: ReturnType<typeof vi.fn> } {
  let call = 0;
  return {
    saveProgress: vi.fn(),
    markFinished: vi.fn(),
    play: vi.fn(),
    sessionKey: (media) => `episode|${media.itemId}`,
    currentSessionKey: () => keys[Math.min(call++, keys.length - 1)] ?? null,
  };
}

describe('nextEpisodeContinuation', () => {
  it('enchaine l’episode suivant, saison suivante comprise', async () => {
    const d = deps(['episode|2']);
    const next = nextEpisodeContinuation(ctx, d, episodes[1]!);
    expect(next?.label).toBe('S2E1');
    await expect(next?.start()).resolves.toBe(true);
    expect(d.play).toHaveBeenCalledTimes(1);
    expect(d.play.mock.calls[0]?.[0].media).toMatchObject({ kind: 'episode', ownerId: '201', itemId: '3' });
  });

  it('ne remplace pas une AUTRE lecture lancee pendant la preparation', async () => {
    // La lecture en cours change entre le debut et la fin de start() (zapping Live).
    const d = deps(['episode|1', 'live|42']);
    const next = nextEpisodeContinuation(ctx, d, episodes[0]!);
    await expect(next?.start()).resolves.toBe(false);
    expect(d.play).not.toHaveBeenCalled();
  });

  it('dernier episode : aucune suite', () => {
    expect(nextEpisodeContinuation(ctx, deps([null]), episodes[2]!)).toBeNull();
  });
});
