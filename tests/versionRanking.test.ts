import { describe, expect, it } from 'vitest';
import { rankVersions, type StreamStat } from '@/utils/versionRanking';

const NOW = 1_800_000_000_000;
const H = 3_600_000;

const versions = [
  { id: 'fhd', qualityScore: 100, quality: 'FHD' as const },
  { id: 'hd', qualityScore: 88, quality: 'HD' as const },
  { id: 'uhd', qualityScore: 80, quality: 'UHD' as const },
];

function stats(map: Record<string, Partial<StreamStat>>) {
  return (id: string): StreamStat | undefined =>
    map[id] !== undefined ? { ok: 0, fail: 0, lastOkAt: null, lastFailAt: null, ...map[id] } : undefined;
}

const ids = (list: { id: string }[]) => list.map((v) => v.id);

describe('ordre des versions', () => {
  it('sans historique : ordre qualite', () => {
    expect(ids(rankVersions(versions, stats({}), { constrained: false, now: NOW }))).toEqual(['fhd', 'hd', 'uhd']);
  });

  it('la derniere version qui a marche passe en premier', () => {
    const s = stats({ uhd: { ok: 3, lastOkAt: NOW - H } });
    expect(ids(rankVersions(versions, s, { constrained: false, now: NOW }))[0]).toBe('uhd');
  });

  it('une version qui vient d’echouer passe en dernier', () => {
    const s = stats({ fhd: { fail: 1, lastFailAt: NOW - H } });
    expect(ids(rankVersions(versions, s, { constrained: false, now: NOW }))).toEqual(['hd', 'uhd', 'fhd']);
  });

  it('un echec suivi d’un succes est pardonne', () => {
    const s = stats({ fhd: { ok: 1, fail: 1, lastFailAt: NOW - 2 * H, lastOkAt: NOW - H } });
    expect(ids(rankVersions(versions, s, { constrained: false, now: NOW }))[0]).toBe('fhd');
  });

  it('un vieil echec est oublie', () => {
    const s = stats({ fhd: { fail: 1, lastFailAt: NOW - 5 * 24 * H } });
    expect(ids(rankVersions(versions, s, { constrained: false, now: NOW }))[0]).toBe('fhd');
  });

  it('reseau faible : la HD passe devant FHD et 4K, meme deja reussies', () => {
    const s = stats({ uhd: { ok: 5, lastOkAt: NOW - H } });
    expect(ids(rankVersions(versions, s, { constrained: true, now: NOW }))[0]).toBe('hd');
  });
});
