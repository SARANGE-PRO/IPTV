import { db } from '@/db/database';
import { normalizeShortEpg } from '@/services/epg/epgNormalizer';
import * as xtreamApi from '@/services/xtream/xtreamApi';
import type { EpgProgramme } from '@/types/epg';
import type { XtreamCredentials } from '@/types/xtream';

/**
 * EPG a la demande, JAMAIS en masse. Chargement uniquement pour la chaine
 * ouverte (ou visible), cache Dexie a TTL court, non bloquant. Aucun flux,
 * aucun identifiant persiste ici (les creds ne servent qu'a l'appel proxy).
 */

const TTL_MS = 20 * 60 * 1000; // 20 min

/**
 * Programmes d'une chaine (cache Dexie stale-while-error). `limit` = nombre de
 * programmes a venir demandes (defaut 16 : couvre un horizon plus large que 8
 * pour la detection d'evenements sportifs, sans exploser le poids EPG).
 */
export async function getChannelEpg(
  credentials: XtreamCredentials,
  streamId: string,
  limit = 16,
): Promise<EpgProgramme[]> {
  const cached = await db.epg_cache.get(streamId);
  if (cached !== undefined && Date.now() - cached.fetchedAt < TTL_MS) {
    return cached.programmes;
  }
  try {
    const raw = await xtreamApi.getShortEpg(credentials, streamId, limit);
    const programmes = normalizeShortEpg(raw);
    await db.epg_cache.put({ id: streamId, programmes, fetchedAt: Date.now() });
    return programmes;
  } catch {
    // Reseau/panel KO : on garde l'ancien cache s'il existe, sinon vide.
    return cached?.programmes ?? [];
  }
}

export async function clearEpgCache(): Promise<void> {
  await db.epg_cache.clear();
}
