import { after, NextResponse } from 'next/server';
import { loadGuide } from '@/server/football/feed';
import type { TvSchedule } from '@/types/tvGuide';

/**
 * Programme TV des chaines FRANCAISES (24 h) pour la liste Live — metadonnees
 * publiques uniquement (guide xmltvfr, deja lu et mis en cache 3 h pour le
 * football : meme analyse). Aucun identifiant, aucun flux.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Au demarrage a froid, on ne fait pas attendre la page Live. */
const WAIT_MS = 6_000;

export async function GET(): Promise<NextResponse> {
  const pending = loadGuide();
  const result = await Promise.race([
    pending,
    new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), WAIT_MS)),
  ]);

  if (result === 'timeout' || result === null) {
    // Guide en construction (ou indisponible) : il finira en tache de fond.
    if (result === 'timeout') after(() => pending.then(() => undefined));
    return NextResponse.json(
      { ok: false, loading: result === 'timeout' },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const body: TvSchedule & { ok: true } = { ok: true, fetchedAt: result.fetchedAt, channels: result.schedule ?? {} };
  return NextResponse.json(body, {
    headers: { 'Cache-Control': 's-maxage=1800, stale-while-revalidate=3600' },
  });
}
