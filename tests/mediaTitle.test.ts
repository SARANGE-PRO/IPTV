import { describe, expect, it } from 'vitest';
import { parseMediaTitle, stripDecorative, titleGroupKey } from '@/utils/mediaTitle';

describe('parseMediaTitle — variante de langue', () => {
  it.each([
    ['Inception (2010) VF', 'VF'],
    ['Inception 2010 MULTI 1080p', 'MULTI'],
    ['Inception 2010 VOSTFR', 'VOSTFR'],
    ['FR| Inception 2010 FRENCH 1080p', 'VF'],
  ])('%s -> %s', (raw, variant) => {
    expect(parseMediaTitle(raw).variant).toBe(variant);
  });

  it('un mot courant du titre n’est pas un tag', () => {
    const parsed = parseMediaTitle('The French Dispatch (2021)');
    expect(parsed.title).toContain('French Dispatch');
    expect(parsed.year).toBe(2021);
  });

  it('la categorie fournisseur donne la langue a defaut du titre', () => {
    expect(parseMediaTitle('Inception 2010', 'FILMS VOSTFR').variant).toBe('VOSTFR');
  });
});

describe('parseMediaTitle — titre, annee, qualite', () => {
  it('extrait titre et annee', () => {
    const parsed = parseMediaTitle('Le Comte de Monte-Cristo (2024) 4K VF');
    expect(parsed.title).toBe('Le Comte de Monte-Cristo');
    expect(parsed.year).toBe(2024);
    expect(parsed.qualityLabel).toBe('4K');
  });

  it('classe 4K au-dessus du HD', () => {
    expect(parseMediaTitle('Dune 2021 4K').qualityScore).toBeGreaterThan(parseMediaTitle('Dune 2021 720p').qualityScore);
  });

  it('jamais de titre vide', () => {
    expect(parseMediaTitle('VF').title.length).toBeGreaterThan(0);
  });
});

describe('regroupement des versions', () => {
  it('VF et VOSTFR d’un meme film partagent la cle', () => {
    const a = parseMediaTitle('Dune (2021) VF');
    const b = parseMediaTitle('Dune 2021 VOSTFR 1080p');
    expect(titleGroupKey(a.title, a.year)).toBe(titleGroupKey(b.title, b.year));
  });

  it('retire les decorations unicode', () => {
    expect(stripDecorative('Dune ᴴᴰ ⁴ᴷ')).toBe('Dune');
  });
});
