import { NextResponse } from 'next/server';
import { TMDB_API_KEY } from '@/config/env';

/**
 * Tendances TMDB de la semaine (films + series), en francais. Source de verite
 * de « ce qui est chaud » mondialement — le MATCHING avec le catalogue Xtream VF
 * se fait cote CLIENT (le catalogue vit dans Dexie, credentials jamais exposes).
 *
 * 100% metadonnees TMDB (affiche HD, synopsis FR, note). Cache 12 h : un Top ne
 * bouge pas toutes les 5 min -> on epargne le quota TMDB. Ideal : Vercel Cron.
 */

export const revalidate = 43_200; // 12 h
export const maxDuration = 30;

const TMDB_BASE = 'https://api.themoviedb.org/3';
const TIMEOUT_MS = 12_000;
const PAGES = 3; // 3 x 20 = 60 candidats par type (assez pour trouver 10 presents)

export interface TrendingEntry {
  tmdbId: number;
  type: 'movie' | 'tv';
  title: string;
  year: number | null;
  posterPath: string | null;
  overview: string | null;
  rating: number | null;
}

interface TmdbTrendingRow {
  id?: number;
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path?: string | null;
  overview?: string;
  vote_average?: number;
}

function yearOf(date: string | undefined): number | null {
  if (date === undefined || date.length < 4) return null;
  const y = Number.parseInt(date.slice(0, 4), 10);
  return Number.isFinite(y) ? y : null;
}

function authFor(target: string): { url: string; headers: Record<string, string> } {
  const headers: Record<string, string> = { accept: 'application/json' };
  const isV4 = TMDB_API_KEY.includes('.');
  if (isV4) {
    headers.authorization = `Bearer ${TMDB_API_KEY}`;
    return { url: target, headers };
  }
  return { url: `${target}${target.includes('?') ? '&' : '?'}api_key=${encodeURIComponent(TMDB_API_KEY)}`, headers };
}

async function fetchTrendingPage(type: 'movie' | 'tv', page: number): Promise<TrendingEntry[]> {
  const target = `${TMDB_BASE}/trending/${type}/week?language=fr-FR&page=${page}`;
  const { url, headers } = authFor(target);
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS), next: { revalidate } });
    if (!res.ok) return [];
    const data = (await res.json()) as { results?: TmdbTrendingRow[] };
    const rows = Array.isArray(data.results) ? data.results : [];
    return rows
      .filter((r): r is TmdbTrendingRow & { id: number } => typeof r.id === 'number')
      .map((r) => ({
        tmdbId: r.id,
        type,
        title: (type === 'movie' ? r.title : r.name) ?? '',
        year: yearOf(type === 'movie' ? r.release_date : r.first_air_date),
        posterPath: r.poster_path ?? null,
        overview: r.overview !== undefined && r.overview !== '' ? r.overview : null,
        rating: typeof r.vote_average === 'number' ? r.vote_average : null,
      }))
      .filter((e) => e.title !== '' && e.posterPath !== null);
  } catch {
    return [];
  }
}

export async function GET(): Promise<NextResponse> {
  if (TMDB_API_KEY === '') {
    return NextResponse.json({ ok: false, movies: [], series: [], error: 'not_configured' }, { headers: { 'Cache-Control': 'no-store' } });
  }
  const pages = Array.from({ length: PAGES }, (_, i) => i + 1);
  const [moviePages, tvPages] = await Promise.all([
    Promise.all(pages.map((p) => fetchTrendingPage('movie', p))),
    Promise.all(pages.map((p) => fetchTrendingPage('tv', p))),
  ]);

  // Aplati en preservant l'ordre de popularite (page 1 d'abord), dedup par id.
  const dedup = (lists: TrendingEntry[][]): TrendingEntry[] => {
    const seen = new Set<number>();
    const out: TrendingEntry[] = [];
    for (const list of lists) {
      for (const e of list) {
        if (seen.has(e.tmdbId)) continue;
        seen.add(e.tmdbId);
        out.push(e);
      }
    }
    return out;
  };

  return NextResponse.json(
    { ok: true, movies: dedup(moviePages), series: dedup(tvPages) },
    { headers: { 'Cache-Control': 's-maxage=43200, stale-while-revalidate=86400' } },
  );
}
