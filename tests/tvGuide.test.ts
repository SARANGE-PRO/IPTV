import { describe, expect, it } from 'vitest';
import { parseGuide } from '@/server/football/tvGuide';

const NOW = Date.UTC(2026, 9, 23, 18, 30); // 20:30 a Paris

async function* chunks(text: string): AsyncGenerator<string> {
  // Decoupe arbitraire : les balises coupees entre deux blocs doivent passer.
  for (let i = 0; i < text.length; i += 37) yield text.slice(i, i + 37);
}

const XML = `<?xml version="1.0"?><tv>
<channel id="France2.fr"><display-name>France 2</display-name></channel>
<channel id="LocalTV.fr"><display-name>Tele Locale Inconnue</display-name></channel>
<programme start="20261023190000 +0200" stop="20261023204500 +0200" channel="France2.fr"><title>Journal &amp; météo</title></programme>
<programme start="20261023204500 +0200" stop="20261023223000 +0200" channel="France2.fr"><title>Le film du soir</title></programme>
<programme start="20261025204500 +0200" stop="20261025223000 +0200" channel="France2.fr"><title>Trop loin</title></programme>
<programme start="20261023200000 +0200" stop="20261023210000 +0200" channel="LocalTV.fr"><title>Ignore</title></programme>
</tv>`;

describe('guide TV des chaines FR', () => {
  it('garde le programme 24 h des chaines du referentiel, sous leur nom', async () => {
    const { schedule } = await parseGuide(chunks(XML), NOW);
    expect(Object.keys(schedule)).toEqual(['France 2']);
    const titles = schedule['France 2']!.map((s) => s[2]);
    expect(titles).toEqual(['Journal & météo', 'Le film du soir']);
    const [start, end] = schedule['France 2']![1]!;
    expect(start * 60_000).toBe(Date.UTC(2026, 9, 23, 18, 45));
    expect(end - start).toBe(105);
  });
});

describe('programme en cours', async () => {
  const { tvNowFor, tvProgress } = await import('@/utils/tvNow');
  const slots: [number, number, string][] = [
    [100, 160, 'Journal'],
    [160, 250, 'Film'],
    [260, 300, 'Apres un trou'],
  ];

  it('trouve le programme a l’antenne et le suivant contigu', () => {
    const now = tvNowFor(slots, 120 * 60_000)!;
    expect(now.title).toBe('Journal');
    expect(now.nextTitle).toBe('Film');
    expect(tvProgress(now, 130 * 60_000)).toBeCloseTo(0.5);
  });

  it('pas de suivant annonce apres un trou du guide', () => {
    expect(tvNowFor(slots, 200 * 60_000)?.nextTitle).toBeNull();
  });

  it('rien entre deux programmes ni hors guide', () => {
    expect(tvNowFor(slots, 255 * 60_000)).toBeNull();
    expect(tvNowFor(undefined, 0)).toBeNull();
  });
});
