import { describe, expect, it } from 'vitest';
import { EMPTY_VOD_EXTRAS, normalizeVodInfo } from '@/services/media/vodInfoService';

describe('normalizeVodInfo', () => {
  it('reprend synopsis, visuels, duree et bande-annonce du panel', () => {
    expect(
      normalizeVodInfo({
        info: {
          plot: 'Un film.',
          movie_image: 'http://img/poster.jpg',
          backdrop_path: ['http://img/bd1.jpg', 'http://img/bd2.jpg'],
          duration_secs: '6720',
          youtube_trailer: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        },
      }),
    ).toEqual({
      plot: 'Un film.',
      posterUrl: 'http://img/poster.jpg',
      backdropUrl: 'http://img/bd1.jpg',
      durationSecs: 6720,
      trailerKey: 'dQw4w9WgXcQ',
    });
  });

  it('retombe sur description / cover / duree horloge', () => {
    const x = normalizeVodInfo({
      info: { plot: '  ', description: 'Résumé', cover: 'http://img/c.jpg', duration_secs: 0, duration: '01:52:00' },
    });
    expect(x.plot).toBe('Résumé');
    expect(x.posterUrl).toBe('http://img/c.jpg');
    expect(x.durationSecs).toBe(6720);
  });

  it('traite les champs vides comme absents', () => {
    expect(normalizeVodInfo({ info: { plot: '', movie_image: '', backdrop_path: '', youtube_trailer: '' } })).toEqual(
      EMPTY_VOD_EXTRAS,
    );
    expect(normalizeVodInfo({})).toEqual(EMPTY_VOD_EXTRAS);
  });
});
