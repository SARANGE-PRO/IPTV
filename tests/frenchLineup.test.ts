import { describe, expect, it } from 'vitest';
import { buildLineupEntries, type LineupSourceRow } from '@/services/live/frenchLineupClassifier';
import { rankVersionLogos } from '@/utils/channelLogos';

function row(id: string, name: string, categoryId = 'fr', logoUrl: string | null = null): LineupSourceRow {
  return { id, name, categoryId, logoUrl };
}

const CATEGORIES: Record<string, string> = { fr: 'FRANCE TNT', sport: 'FR| SPORTS' };
const categoryOf = (id: string) => CATEGORIES[id] ?? '';

describe('grille des chaines FR', () => {
  const entries = buildLineupEntries(
    [
      row('1', 'FR| TF1 HD'),
      row('2', 'FR| TF1 FHD'),
      row('3', 'FR| FRANCE 2 HD'),
      row('4', 'FR| M6 HD'),
      row('5', 'FR| CANAL+ FHD'),
    ],
    categoryOf,
  );
  const byId = new Map(entries.map((e) => [e.id, e]));

  it('regroupe les versions d’une meme chaine', () => {
    expect(byId.get('1')?.groupKey).toBe(byId.get('2')?.groupKey);
    expect(byId.get('1')?.groupKey).not.toBe(byId.get('3')?.groupKey);
  });

  it('numerotation TNT et ordre de la grille', () => {
    expect(byId.get('1')?.lcn).toBe(1);
    expect(byId.get('3')?.lcn).toBe(2);
    expect(byId.get('4')?.lcn).toBe(6);
    const tf1 = byId.get('1')!.sortKey;
    const fr2 = byId.get('3')!.sortKey;
    const m6 = byId.get('4')!.sortKey;
    expect(tf1 < fr2 && fr2 < m6).toBe(true);
  });

  it('nom d’affichage du referentiel', () => {
    expect(byId.get('2')?.name).toBe('TF1');
  });

  it('la FHD est mieux classee que la HD', () => {
    expect(byId.get('2')!.qualityScore).toBeGreaterThan(byId.get('1')!.qualityScore);
  });
});

describe('logos des versions', () => {
  it('le logo le plus partage passe en premier', () => {
    expect(rankVersionLogos([{ logoUrl: 'a' }, { logoUrl: 'b' }, { logoUrl: 'b' }, { logoUrl: null }])).toEqual(['b', 'a']);
  });

  it('a egalite, l’ordre recu (meilleure version) l’emporte ; vides ignores', () => {
    expect(rankVersionLogos([{ logoUrl: ' x ' }, { logoUrl: 'y' }, { logoUrl: '' }])).toEqual(['x', 'y']);
  });
});
