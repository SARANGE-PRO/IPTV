import * as catalogRepository from '@/db/repositories/catalogRepository';
import { normalizeSeriesDetails } from '@/services/xtream/normalize';
import * as xtreamApi from '@/services/xtream/xtreamApi';
import type { SeriesDetails } from '@/types/models';
import type { XtreamCredentials } from '@/types/xtream';

/** Saisons/episodes charges A LA DEMANDE, caches dans Dexie avec TTL. */

const TTL_MS = 12 * 60 * 60 * 1000;

export async function getSeriesDetailsCached(
  creds: XtreamCredentials,
  seriesId: string,
  opts?: { force?: boolean },
): Promise<SeriesDetails> {
  const cached = await catalogRepository.getSeriesDetails(seriesId);
  const fresh = cached !== undefined && Date.now() - cached.fetchedAt < TTL_MS;
  if (cached !== undefined && fresh && !(opts?.force ?? false)) return cached;

  try {
    const raw = await xtreamApi.getSeriesInfo(creds, seriesId);
    const details = normalizeSeriesDetails(seriesId, raw);
    await catalogRepository.putSeriesDetails(details);
    return details;
  } catch (err) {
    // Reseau KO : un cache perime vaut mieux que rien.
    if (cached !== undefined) return cached;
    throw err;
  }
}
