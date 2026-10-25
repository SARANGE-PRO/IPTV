import { describe, expect, it } from 'vitest';
import { normalizeSeriesDetails } from '@/services/xtream/normalize';

describe('normalizeSeriesDetails', () => {
  it('prend la saison dans la cle quand l’episode ne la repete pas', () => {
    const d = normalizeSeriesDetails('201', {
      seasons: [{ season_number: 1 }, { season_number: 2 }],
      episodes: {
        '1': [{ id: 1, episode_num: 1 }],
        '2': [{ id: 2, episode_num: 1 }, { id: 3, episode_num: 2 }],
      },
    });
    expect(d.episodes.map((e) => [e.id, e.seasonNumber, e.episodeNumber])).toEqual([
      ['1', 1, 1],
      ['2', 2, 1],
      ['3', 2, 2],
    ]);
  });

  it('garde `season` de l’episode quand il est fourni', () => {
    const d = normalizeSeriesDetails('201', { episodes: { '1': [{ id: 9, episode_num: 4, season: 3 }] } });
    expect(d.episodes[0]?.seasonNumber).toBe(3);
    // Saisons absentes : derivees des episodes.
    expect(d.seasons.map((s) => s.seasonNumber)).toEqual([3]);
  });

  it('forme tableau de tableaux : saison 1 par defaut', () => {
    const d = normalizeSeriesDetails('201', { episodes: [[{ id: 5, episode_num: 1 }]] });
    expect(d.episodes[0]?.seasonNumber).toBe(1);
  });
});
