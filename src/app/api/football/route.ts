import { after, NextResponse } from 'next/server';
import { DEFAULT_COMPETITION_CODES } from '@/config/footballCompetitions';
import { fetchEspnTeams } from '@/server/football/espn';
import { buildFootballFeed, loadGuide } from '@/server/football/feed';

/**
 * Football (refonte) — 100 % metadonnees publiques, aucune cle obligatoire :
 *  - `?comps=fra.1,uefa.champions,…` -> matchs (36 h passees -> 9 jours) avec
 *    score/minute en direct ET chaines FR (exactes via le guide TV, sinon
 *    probables). Voir src/server/football/*.
 *  - `?teams=fra.1` -> equipes d'une competition (equipes favorites).
 *  - `?warm=1` -> prechauffe le cache du guide TV (Vercel Cron).
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request): Promise<NextResponse> {
  const params = new URL(request.url).searchParams;

  if (params.get('warm') === '1') {
    const guide = await loadGuide();
    return NextResponse.json(
      { ok: guide !== null, programmes: guide?.programmes.length ?? 0 },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const teamsComp = params.get('teams');
  if (teamsComp !== null && teamsComp !== '') {
    const teams = await fetchEspnTeams(teamsComp);
    return NextResponse.json(
      { ok: true, teams },
      { headers: { 'Cache-Control': 's-maxage=86400, stale-while-revalidate=172800' } },
    );
  }

  const raw = params.get('comps');
  const codes =
    raw === null || raw.trim() === ''
      ? DEFAULT_COMPETITION_CODES
      : raw
          .split(',')
          .map((c) => c.trim())
          .filter(Boolean)
          .slice(0, 40);

  const feed = await buildFootballFeed({
    codes,
    onPendingGuide: (pending) => after(() => pending.then(() => undefined)),
  });

  return NextResponse.json(
    { ok: true, ...feed },
    {
      headers: {
        // Scores en direct : cache CDN tres court ; guide en construction -> pas de cache.
        'Cache-Control': feed.guide === 'loading' ? 'no-store' : 's-maxage=30, stale-while-revalidate=60',
      },
    },
  );
}
