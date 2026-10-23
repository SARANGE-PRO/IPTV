import { FOOTBALL_API_KEY } from '@/config/env';
import { COMPETITION_BY_CODE } from '@/config/footballCompetitions';
import type { FootballMatch, MatchSide, MatchState } from '@/types/football';
import { frenchTeamName } from '@/utils/footballMatch';

/**
 * SECOURS football-data.org (SERVEUR) : utilise uniquement si ESPN ne repond
 * pas pour une competition ET si FOOTBALL_API_KEY est configuree. Palier
 * gratuit : 12 competitions, scores legerement retardes.
 */

const FD_BASE = 'https://api.football-data.org/v4';

interface FdTeam {
  id?: number;
  name?: string;
  shortName?: string;
  tla?: string;
  crest?: string;
}

interface FdMatch {
  id?: number;
  utcDate?: string;
  status?: string;
  minute?: number | null;
  venue?: string | null;
  homeTeam?: FdTeam;
  awayTeam?: FdTeam;
  score?: { winner?: string | null; fullTime?: { home?: number | null; away?: number | null } };
}

function stateOf(status: string): MatchState {
  if (status === 'IN_PLAY') return 'live';
  if (status === 'PAUSED') return 'halftime';
  if (status === 'FINISHED' || status === 'AWARDED') return 'finished';
  if (status === 'POSTPONED' || status === 'SUSPENDED') return 'postponed';
  if (status === 'CANCELLED') return 'canceled';
  return 'scheduled';
}

function side(t: FdTeam | undefined, goals: number | null | undefined, winner: boolean | null): MatchSide {
  const name = frenchTeamName(t?.name ?? '');
  return {
    id: typeof t?.id === 'number' ? `fd:${t.id}` : '',
    name,
    short: frenchTeamName(t?.shortName ?? t?.name ?? ''),
    abbr: t?.tla ?? '',
    logo: t?.crest ?? null,
    score: typeof goals === 'number' ? goals : null,
    shootout: null,
    winner,
  };
}

function ymd(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function footballDataAvailable(code: string): boolean {
  return FOOTBALL_API_KEY !== '' && COMPETITION_BY_CODE.get(code)?.fdCode !== undefined;
}

export async function fetchFootballDataMatches(code: string, from: number, to: number): Promise<FootballMatch[] | null> {
  const def = COMPETITION_BY_CODE.get(code);
  if (FOOTBALL_API_KEY === '' || def?.fdCode === undefined) return null;
  try {
    const res = await fetch(
      `${FD_BASE}/competitions/${def.fdCode}/matches?dateFrom=${ymd(from)}&dateTo=${ymd(to)}`,
      { headers: { 'X-Auth-Token': FOOTBALL_API_KEY }, cache: 'no-store', signal: AbortSignal.timeout(10_000) },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { matches?: FdMatch[] };
    return (data.matches ?? [])
      .filter((m): m is FdMatch & { id: number; utcDate: string } => typeof m.id === 'number' && typeof m.utcDate === 'string')
      .map((m) => {
        const state = stateOf(m.status ?? 'SCHEDULED');
        const winner = m.score?.winner ?? null;
        return {
          id: `fd:${m.id}`,
          start: Date.parse(m.utcDate),
          state,
          clock:
            state === 'live'
              ? typeof m.minute === 'number'
                ? `${m.minute}'`
                : 'En direct'
              : state === 'halftime'
                ? 'MT'
                : state === 'finished'
                  ? 'Terminé'
                  : null,
          competition: { code, name: def.name, short: def.short, logo: null },
          round: null,
          venue: m.venue ?? null,
          home: side(m.homeTeam, m.score?.fullTime?.home, winner === null ? null : winner === 'HOME_TEAM'),
          away: side(m.awayTeam, m.score?.fullTime?.away, winner === null ? null : winner === 'AWAY_TEAM'),
          tv: [],
        } satisfies FootballMatch;
      })
      .filter((m) => m.start >= from && m.start <= to);
  } catch {
    return null;
  }
}
