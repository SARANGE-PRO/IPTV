import { COMPETITION_BY_CODE } from '@/config/footballCompetitions';
import type { FootballMatch, FootballTeam, MatchSide, MatchState } from '@/types/football';
import { frenchTeamName } from '@/utils/footballMatch';

/**
 * Matchs & scores via l'API publique d'ESPN (site.api.espn.com) — SERVEUR.
 * Aucune cle, toutes les competitions (coupes d'Europe, championnats, coupes
 * nationales, selections), score/minute en direct. Un appel par competition
 * et par MOIS (`dates=YYYYMM`) : ~1-2 appels par competition suivie.
 * Cache memoire court (30 s) : les reponses mensuelles depassent parfois la
 * limite de taille du cache de donnees Next (2 Mo) -> pas de fetch cache.
 */

const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/soccer';
const TIMEOUT_MS = 10_000;
const TTL_MS = 30_000;

interface EspnTeam {
  id?: string;
  displayName?: string;
  shortDisplayName?: string;
  abbreviation?: string;
  name?: string;
  logo?: string;
  logos?: { href?: string }[];
}

interface EspnCompetitor {
  homeAway?: 'home' | 'away';
  score?: string;
  shootoutScore?: number;
  winner?: boolean;
  team?: EspnTeam;
}

interface EspnEvent {
  id?: string;
  date?: string;
  season?: { slug?: string };
  status?: { displayClock?: string; type?: { name?: string; state?: string; completed?: boolean } };
  competitions?: { venue?: { fullName?: string }; competitors?: EspnCompetitor[] }[];
}

interface EspnScoreboard {
  leagues?: { name?: string; logos?: { href?: string }[] }[];
  events?: EspnEvent[];
}

const cache = new Map<string, { at: number; value: Promise<EspnScoreboard | null> }>();

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function cachedScoreboard(url: string): Promise<EspnScoreboard | null> {
  const hit = cache.get(url);
  if (hit !== undefined && Date.now() - hit.at < TTL_MS) return hit.value;
  const value = getJson<EspnScoreboard>(url);
  cache.set(url, { at: Date.now(), value });
  if (cache.size > 200) {
    for (const [key, entry] of cache) if (Date.now() - entry.at > TTL_MS) cache.delete(key);
  }
  return value;
}

/** Mois (YYYYMM, UTC) couverts par la fenetre. */
export function monthsBetween(from: number, to: number): string[] {
  const out: string[] = [];
  const d = new Date(Date.UTC(new Date(from).getUTCFullYear(), new Date(from).getUTCMonth(), 1));
  while (d.getTime() <= to) {
    out.push(`${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return out;
}

const ROUND_LABEL: Record<string, string> = {
  'league-phase': 'Phase de ligue',
  'group-stage': 'Phase de groupes',
  'knockout-round-playoffs': 'Barrages',
  'round-of-32': '16es de finale',
  'round-of-16': '8es de finale',
  quarterfinals: 'Quarts de finale',
  semifinals: 'Demi-finales',
  final: 'Finale',
  '3rd-place': 'Match pour la 3e place',
};

function stateOf(event: EspnEvent): { state: MatchState; clock: string | null } {
  const type = event.status?.type;
  const name = type?.name ?? '';
  const phase = type?.state ?? 'pre';
  if (name.includes('POSTPONED')) return { state: 'postponed', clock: 'Reporté' };
  if (name.includes('CANCELED') || name.includes('ABANDONED') || name.includes('FORFEIT')) {
    return { state: 'canceled', clock: name.includes('ABANDONED') ? 'Arrêté' : 'Annulé' };
  }
  if (phase === 'in') {
    if (name.includes('HALFTIME')) return { state: 'halftime', clock: 'MT' };
    if (name.includes('SHOOTOUT')) return { state: 'live', clock: 'TAB' };
    const clock = event.status?.displayClock?.replace(/'$/, "'") ?? null;
    return { state: 'live', clock: clock !== null && clock !== '' ? clock : 'En direct' };
  }
  if (phase === 'post') {
    if (name.includes('PEN')) return { state: 'finished', clock: 'TAB' };
    if (name.includes('AET')) return { state: 'finished', clock: 'a.p.' };
    return { state: 'finished', clock: 'Terminé' };
  }
  return { state: 'scheduled', clock: null };
}

function sideOf(c: EspnCompetitor | undefined, started: boolean): MatchSide {
  const t = c?.team ?? {};
  const name = frenchTeamName(t.displayName ?? t.name ?? '');
  const score = started && c?.score !== undefined && c.score !== '' ? Number.parseInt(c.score, 10) : null;
  return {
    id: t.id ?? '',
    name,
    short: frenchTeamName(t.shortDisplayName ?? t.displayName ?? name),
    abbr: t.abbreviation ?? '',
    logo: t.logo ?? t.logos?.[0]?.href ?? null,
    score: score !== null && Number.isFinite(score) ? score : null,
    shootout: typeof c?.shootoutScore === 'number' ? c.shootoutScore : null,
    winner: typeof c?.winner === 'boolean' ? c.winner : null,
  };
}

export function mapEspnEvent(code: string, leagueLogo: string | null, event: EspnEvent): FootballMatch | null {
  if (event.id === undefined || event.date === undefined) return null;
  const start = Date.parse(event.date);
  if (!Number.isFinite(start)) return null;
  const comp = event.competitions?.[0];
  const competitors = comp?.competitors ?? [];
  const { state, clock } = stateOf(event);
  const started = state !== 'scheduled' && state !== 'postponed';
  const def = COMPETITION_BY_CODE.get(code);
  const slug = event.season?.slug ?? '';
  return {
    id: `espn:${event.id}`,
    start,
    state,
    clock,
    competition: { code, name: def?.name ?? code, short: def?.short ?? code, logo: leagueLogo },
    round: ROUND_LABEL[slug] ?? null,
    venue: comp?.venue?.fullName ?? null,
    home: sideOf(competitors.find((c) => c.homeAway === 'home') ?? competitors[0], started),
    away: sideOf(competitors.find((c) => c.homeAway === 'away') ?? competitors[1], started),
    tv: [],
  };
}

/** Matchs d'une competition dans [from, to]. null = source indisponible. */
export async function fetchEspnMatches(code: string, from: number, to: number): Promise<FootballMatch[] | null> {
  const boards = await Promise.all(
    monthsBetween(from, to).map((ym) =>
      cachedScoreboard(`${ESPN}/${encodeURIComponent(code)}/scoreboard?dates=${ym}&limit=500`),
    ),
  );
  if (boards.every((b) => b === null)) return null;
  const out: FootballMatch[] = [];
  for (const board of boards) {
    if (board === null) continue;
    const logo = board.leagues?.[0]?.logos?.[0]?.href ?? null;
    for (const event of board.events ?? []) {
      const match = mapEspnEvent(code, logo, event);
      if (match !== null && match.start >= from && match.start <= to) out.push(match);
    }
  }
  return out;
}

/** Equipes d'une competition (selecteur d'equipes favorites). */
export async function fetchEspnTeams(code: string): Promise<FootballTeam[]> {
  const data = await getJson<{ sports?: { leagues?: { teams?: { team?: EspnTeam }[] }[] }[] }>(
    `${ESPN}/${encodeURIComponent(code)}/teams`,
  );
  const teams = data?.sports?.[0]?.leagues?.[0]?.teams ?? [];
  return teams
    .map(({ team }) => team)
    .filter((t): t is EspnTeam & { id: string } => t?.id !== undefined)
    .map((t) => ({
      id: t.id,
      name: frenchTeamName(t.displayName ?? t.name ?? ''),
      short: frenchTeamName(t.shortDisplayName ?? t.displayName ?? ''),
      logo: t.logos?.[0]?.href ?? t.logo ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}
