import { NextResponse } from 'next/server';
import { FOOTBALL_API_KEY } from '@/config/env';

/**
 * Football en direct via football-data.org (v4). La cle reste SERVEUR
 * (FOOTBALL_API_KEY, jamais NEXT_PUBLIC_). Deux usages :
 *  - `?comps=FL1,PL,CL` -> matchs (live + a venir 3 jours) des competitions choisies.
 *  - `?teams=PL`        -> equipes d'une competition (pour le selecteur de favoris).
 *
 * Desactive proprement si la cle n'est pas configuree (renvoie une liste vide).
 * 100% metadonnees sportives publiques.
 */

export const maxDuration = 20;

const FD_BASE = 'https://api.football-data.org/v4';
const TIMEOUT_MS = 12_000;

/** Competitions du palier gratuit : code -> id numerique football-data. */
const COMP_ID: Record<string, number> = {
  FL1: 2015, // Ligue 1
  PL: 2021, // Premier League
  PD: 2014, // Liga
  SA: 2019, // Serie A
  BL1: 2002, // Bundesliga
  PPL: 2017, // Primeira Liga
  DED: 2003, // Eredivisie
  ELC: 2016, // Championship
  BSA: 2013, // Brasileirao
  CL: 2001, // Ligue des Champions
  EC: 2018, // Euro
  WC: 2000, // Coupe du Monde
};

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
  competition?: { code?: string; name?: string };
  homeTeam?: FdTeam;
  awayTeam?: FdTeam;
  score?: { fullTime?: { home?: number | null; away?: number | null } };
}

export interface FootballMatch {
  id: number;
  start: number; // epoch ms
  status: string; // SCHEDULED | TIMED | IN_PLAY | PAUSED | FINISHED | ...
  minute: number | null;
  competition: string;
  competitionCode: string;
  home: { id: number | null; name: string; short: string; crest: string | null; goals: number | null };
  away: { id: number | null; name: string; short: string; crest: string | null; goals: number | null };
}
export interface FootballTeam {
  id: number;
  name: string;
  short: string;
  crest: string | null;
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function fd(path: string): Promise<unknown | null> {
  try {
    const res = await fetch(`${FD_BASE}${path}`, {
      headers: { 'X-Auth-Token': FOOTBALL_API_KEY, accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function teamOf(t: FdTeam | undefined, goals: number | null | undefined): FootballMatch['home'] {
  return {
    id: typeof t?.id === 'number' ? t.id : null,
    name: t?.name ?? '',
    short: t?.shortName ?? t?.tla ?? t?.name ?? '',
    crest: t?.crest ?? null,
    goals: typeof goals === 'number' ? goals : null,
  };
}

export async function GET(request: Request): Promise<NextResponse> {
  if (FOOTBALL_API_KEY === '') {
    return NextResponse.json({ ok: false, error: 'not_configured', matches: [], teams: [] }, { headers: { 'Cache-Control': 'no-store' } });
  }
  const params = new URL(request.url).searchParams;

  // --- Equipes d'une competition (selecteur de favoris) ---------------------
  const teamsComp = params.get('teams');
  if (teamsComp !== null && teamsComp !== '') {
    const data = (await fd(`/competitions/${encodeURIComponent(teamsComp)}/teams`)) as { teams?: FdTeam[] } | null;
    const teams: FootballTeam[] = Array.isArray(data?.teams)
      ? data.teams
          .filter((t): t is FdTeam & { id: number } => typeof t.id === 'number')
          .map((t) => ({ id: t.id, name: t.name ?? '', short: t.shortName ?? t.tla ?? t.name ?? '', crest: t.crest ?? null }))
      : [];
    return NextResponse.json({ ok: true, teams }, { headers: { 'Cache-Control': 's-maxage=86400, stale-while-revalidate=172800' } });
  }

  // --- Matchs des competitions choisies -------------------------------------
  const codes = (params.get('comps') ?? '').split(',').map((c) => c.trim()).filter(Boolean);
  const ids = codes.map((c) => COMP_ID[c]).filter((v): v is number => typeof v === 'number');
  if (ids.length === 0) {
    return NextResponse.json({ ok: true, matches: [] }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const now = new Date();
  const to = new Date(now.getTime() + 3 * 86_400_000);
  const data = (await fd(
    `/matches?competitions=${ids.join(',')}&dateFrom=${ymd(now)}&dateTo=${ymd(to)}`,
  )) as { matches?: FdMatch[] } | null;

  const matches: FootballMatch[] = Array.isArray(data?.matches)
    ? data.matches
        .filter((m): m is FdMatch & { id: number; utcDate: string } => typeof m.id === 'number' && typeof m.utcDate === 'string')
        .map((m) => ({
          id: m.id,
          start: Date.parse(m.utcDate),
          status: m.status ?? 'SCHEDULED',
          minute: typeof m.minute === 'number' ? m.minute : null,
          competition: m.competition?.name ?? '',
          competitionCode: m.competition?.code ?? '',
          home: teamOf(m.homeTeam, m.score?.fullTime?.home),
          away: teamOf(m.awayTeam, m.score?.fullTime?.away),
        }))
        .sort((a, b) => a.start - b.start)
    : [];

  return NextResponse.json(
    { ok: true, matches },
    { headers: { 'Cache-Control': 's-maxage=30, stale-while-revalidate=60' } },
  );
}
