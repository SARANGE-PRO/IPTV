import { COMPETITION_BY_CODE } from '@/config/footballCompetitions';
import { isEventChannel, isFreeToAir } from '@/services/football/tvChannels';
import type { FootballMatch, TvBroadcast } from '@/types/football';
import {
  AFFICHE_MIN_SCORE,
  afficheScore,
  parseAffiche,
  teamForms,
  type Affiche,
  type TeamForms,
} from '@/utils/footballMatch';
import { normalizeText } from '@/utils/text';
import type { GuideProgramme } from './tvGuide';

/**
 * RATTACHEMENT des diffusions TV FR aux matchs (SERVEUR, pur hors E/S).
 *
 * 1. CONFIRMEES : pour chaque match, les programmes du guide qui commencent
 *    autour du coup d'envoi (-30 / +15 min) et dont l'affiche « A / B »
 *    correspond aux deux equipes (noms EN <-> FR). Attribution GLOUTONNE par
 *    score : un programme (une chaine a une heure) ne montre qu'UN match ; un
 *    match peut passer sur plusieurs chaines (Canal+ ET Canal+ Live 1).
 * 2. MULTIPLEX : programme « Multiplex » d'une competition -> rattache a tous
 *    les matchs de cette competition qui debutent pendant ce multiplex.
 * 3. PROBABLES (match sans diffusion confirmee, a venir/en cours) : droits
 *    APPRIS du guide (chaines non evenementielles observees pour la
 *    competition), sinon table 2026-27 de config/footballCompetitions.
 */

const WINDOW_BEFORE_MS = 30 * 60_000;
const WINDOW_AFTER_MS = 15 * 60_000;
/** Un 2e programme n'est garde que s'il est presque aussi sur que le meilleur. */
const SECONDARY_MARGIN = 0.3;
/** Observations minimales pour qu'une chaine devienne « probable » apprise. */
const MIN_OBSERVATIONS = 2;

interface Candidate {
  match: number;
  programme: number;
  score: number;
}

function involvesFrance(m: FootballMatch): boolean {
  const isFrance = (s: string) => normalizeText(s) === 'france';
  return isFrance(m.home.name) || isFrance(m.away.name);
}

/** Ordre d'affichage : confirmee > multiplex > probable ; TNT et chaines « fixes » d'abord. */
function sortBroadcasts(list: TvBroadcast[]): TvBroadcast[] {
  const weight = (b: TvBroadcast): number =>
    (b.confidence === 'confirmed' ? 100 : 0) +
    (b.kind === 'match' ? 20 : 0) +
    (isFreeToAir(b.channel) ? 5 : 0) +
    (isEventChannel(b.channel) ? 0 : 2);
  return [...list].sort((a, b) => weight(b) - weight(a));
}

function competitionOfProgramme(p: GuideProgramme): string[] {
  const text = ` ${normalizeText(`${p.title} ${p.subtitle ?? ''}`).replace(/[^a-z0-9]+/g, ' ')} `;
  const out: string[] = [];
  for (const [code, def] of COMPETITION_BY_CODE) {
    if (def.guideNames.some((n) => text.includes(` ${normalizeText(n).replace(/[^a-z0-9]+/g, ' ').trim()} `))) out.push(code);
  }
  return out;
}

/** « Ligue Europa - 3e journée » -> libelle de journee depuis le guide. */
function roundFromGuide(p: GuideProgramme, affiche: Affiche | null): string | null {
  const sub = p.subtitle ?? '';
  if (sub === '' || (affiche !== null && sub.includes(' / '))) return null;
  if (/journ[ée]e|finale|tour|barrage|phase|groupe|huiti|quart|demi/i.test(sub)) {
    return sub.replace(/^football\.\s*/i, '').replace(/\s*\.\s*$/, '').replace(/\s{2,}/g, ' ').trim();
  }
  return null;
}

export interface AttachResult {
  matches: FootballMatch[];
  /** Droits observes : competition -> chaines (non evenementielles) et nombre d'occurrences. */
  learned: Map<string, Map<string, number>>;
}

export function attachBroadcasts(matches: FootballMatch[], programmes: GuideProgramme[]): AttachResult {
  const forms: { home: TeamForms; away: TeamForms }[] = matches.map((m) => ({
    home: teamForms(m.home),
    away: teamForms(m.away),
  }));
  const affiches = programmes.map((p) => parseAffiche(p.title, p.subtitle));
  const multiplex = programmes.map((p) => /multiplex/i.test(`${p.title} ${p.subtitle ?? ''}`));

  // Index temporel des programmes (pas de 5 min) : jamais de produit croise complet.
  const SLOT = 5 * 60_000;
  const bySlot = new Map<number, number[]>();
  programmes.forEach((p, i) => {
    const slot = Math.floor(p.start / SLOT);
    const list = bySlot.get(slot);
    if (list === undefined) bySlot.set(slot, [i]);
    else list.push(i);
  });
  const near = (kickoff: number): number[] => {
    const out: number[] = [];
    for (let s = Math.floor((kickoff - WINDOW_BEFORE_MS) / SLOT); s <= Math.floor((kickoff + WINDOW_AFTER_MS) / SLOT); s += 1) {
      for (const i of bySlot.get(s) ?? []) {
        const start = programmes[i]?.start ?? 0;
        if (start >= kickoff - WINDOW_BEFORE_MS && start <= kickoff + WINDOW_AFTER_MS) out.push(i);
      }
    }
    return out;
  };

  // 1. Candidats (match, programme) au-dessus du seuil.
  const candidates: Candidate[] = [];
  matches.forEach((m, mi) => {
    if (m.state === 'postponed' || m.state === 'canceled') return;
    const f = forms[mi];
    if (f === undefined) return;
    for (const pi of near(m.start)) {
      const affiche = affiches[pi];
      if (affiche === null || affiche === undefined || multiplex[pi] === true) continue;
      const score = afficheScore(f.home, f.away, affiche);
      if (score >= AFFICHE_MIN_SCORE) candidates.push({ match: mi, programme: pi, score });
    }
  });
  candidates.sort((a, b) => b.score - a.score);

  // 2. Attribution gloutonne.
  const usedProgramme = new Set<number>();
  const best = new Map<number, number>();
  const tv: TvBroadcast[][] = matches.map(() => []);
  const rounds: (string | null)[] = matches.map(() => null);
  const seenChannel: Set<string>[] = matches.map(() => new Set());
  for (const c of candidates) {
    if (usedProgramme.has(c.programme)) continue;
    const top = best.get(c.match);
    if (top !== undefined && c.score < top - SECONDARY_MARGIN) continue;
    const p = programmes[c.programme];
    if (p === undefined) continue;
    usedProgramme.add(c.programme);
    if (top === undefined) best.set(c.match, c.score);
    if (seenChannel[c.match]?.has(p.channel) === true) continue;
    seenChannel[c.match]?.add(p.channel);
    tv[c.match]?.push({ channel: p.channel, confidence: 'confirmed', kind: 'match' });
    rounds[c.match] ??= roundFromGuide(p, affiches[c.programme] ?? null);
  }

  // 3. Multiplex : matchs de la competition qui commencent pendant le programme.
  programmes.forEach((p, pi) => {
    if (multiplex[pi] !== true) return;
    const comps = competitionOfProgramme(p);
    if (comps.length === 0) return;
    matches.forEach((m, mi) => {
      if (!comps.includes(m.competition.code)) return;
      if (m.start < p.start - WINDOW_AFTER_MS || m.start > p.start + WINDOW_BEFORE_MS) return;
      if (seenChannel[mi]?.has(p.channel) === true) return;
      seenChannel[mi]?.add(p.channel);
      tv[mi]?.push({ channel: p.channel, confidence: 'confirmed', kind: 'multiplex' });
    });
  });

  // 4. Droits appris (chaines non evenementielles, diffusions de matchs).
  const learned = new Map<string, Map<string, number>>();
  matches.forEach((m, mi) => {
    for (const b of tv[mi] ?? []) {
      if (b.kind !== 'match' || isEventChannel(b.channel)) continue;
      const counts = learned.get(m.competition.code) ?? new Map<string, number>();
      counts.set(b.channel, (counts.get(b.channel) ?? 0) + 1);
      learned.set(m.competition.code, counts);
    }
  });

  return {
    learned,
    matches: matches.map((m, mi) => ({
      ...m,
      round: rounds[mi] ?? m.round,
      tv: sortBroadcasts(tv[mi] ?? []),
    })),
  };
}

/**
 * Complete les matchs SANS diffusion confirmee (a venir / en cours) par des
 * chaines « probables » : droits appris du guide, sinon table 2026-27.
 */
export function addProbableBroadcasts(
  matches: FootballMatch[],
  learned: Map<string, Map<string, number>>,
): FootballMatch[] {
  return matches.map((m) => {
    if (m.tv.length > 0 || m.state === 'finished' || m.state === 'postponed' || m.state === 'canceled') return m;
    const def = COMPETITION_BY_CODE.get(m.competition.code);
    const observed = [...(learned.get(m.competition.code)?.entries() ?? [])]
      .filter(([, n]) => n >= MIN_OBSERVATIONS)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([channel]) => channel);
    const seed = def !== undefined && (def.seedFranceOnly !== true || involvesFrance(m)) ? def.seedChannels : [];
    const channels = observed.length > 0 ? observed : seed;
    if (channels.length === 0) return m;
    return {
      ...m,
      tv: channels.map((channel) => ({ channel, confidence: 'probable', kind: 'match' }) satisfies TvBroadcast),
    };
  });
}
