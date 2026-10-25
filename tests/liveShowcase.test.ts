import { describe, expect, it } from 'vitest';
import { buildShowcaseRows, pickSpotlight, ROW_LIMIT } from '@/services/live/liveShowcase';
import type { LineupGroup, LiveSection } from '@/types/liveLineup';
import type { TvNow } from '@/types/tvGuide';

const g = (name: string, section: LiveSection, lcn: number | null = null): LineupGroup => ({
  key: name,
  name,
  section,
  theme: 'general',
  lcn,
  country: null,
  isFootball: false,
  versions: [],
});
const MIN = 60_000;
const NOW = 1_000_000 * MIN;
const prog = (startAgoMin: number, lengthMin: number, title = 'P'): TvNow => ({
  title,
  start: NOW - startAgoMin * MIN,
  end: NOW - startAgoMin * MIN + lengthMin * MIN,
  nextTitle: null,
});

describe('pickSpotlight', () => {
  const groups = [g('TF1', 'tnt', 1), g('France 2', 'tnt', 2), g('M6', 'tnt', 6), g('Gulli', 'tnt', 18), g('beIN', 'sport')];

  it('grande chaine dont le programme vient de commencer', () => {
    const guide: Record<string, TvNow> = { TF1: prog(50, 90), 'France 2': prog(25, 60), M6: prog(5, 100), Gulli: prog(1, 60) };
    expect(pickSpotlight(groups, (n) => guide[n] ?? null, NOW)?.group.name).toBe('M6');
  });

  it('jamais un programme tres court, ni une petite chaine', () => {
    const guide: Record<string, TvNow> = { TF1: prog(40, 90), M6: prog(2, 5), Gulli: prog(1, 60) };
    expect(pickSpotlight(groups, (n) => guide[n] ?? null, NOW)?.group.name).toBe('TF1');
  });

  it('sans guide : rien', () => {
    expect(pickSpotlight(groups, () => null, NOW)).toBeNull();
  });
});

describe('buildShowcaseRows', () => {
  it('une rangee par section, dans l’ordre de la grille, bornee si « Tout voir » existe', () => {
    const tnt = Array.from({ length: 30 }, (_, i) => g(`T${i}`, 'tnt', i + 1));
    const rows = buildShowcaseRows([...tnt, g('beIN', 'sport'), g('Autre', 'other')]);
    expect(rows.map((r) => r.section)).toEqual(['tnt', 'sport', 'other']);
    expect(rows[0]?.groups).toHaveLength(ROW_LIMIT);
    expect(rows[0]?.count).toBe(30);
    expect(rows[0]?.view).toBe('tnt');
    expect(rows[2]?.view).toBeNull();
  });
});
