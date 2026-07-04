import type { FootballMatch, FootballTeam } from '@/app/api/football/route';

/** Acces client a la route /api/football (jamais d'appel direct a l'API foot). */

export async function loadFootballMatches(comps: string[]): Promise<FootballMatch[]> {
  if (comps.length === 0) return [];
  try {
    const res = await fetch(`/api/football?comps=${encodeURIComponent(comps.join(','))}`, { cache: 'no-store' });
    if (!res.ok) return [];
    const data = (await res.json()) as { matches?: FootballMatch[] };
    return Array.isArray(data.matches) ? data.matches : [];
  } catch {
    return [];
  }
}

export async function loadCompetitionTeams(code: string): Promise<FootballTeam[]> {
  try {
    const res = await fetch(`/api/football?teams=${encodeURIComponent(code)}`, { cache: 'no-store' });
    if (!res.ok) return [];
    const data = (await res.json()) as { teams?: FootballTeam[] };
    return Array.isArray(data.teams) ? data.teams : [];
  } catch {
    return [];
  }
}

export function isLiveStatus(status: string): boolean {
  return status === 'IN_PLAY' || status === 'PAUSED';
}

export function isFinishedStatus(status: string): boolean {
  return status === 'FINISHED' || status === 'AWARDED';
}
