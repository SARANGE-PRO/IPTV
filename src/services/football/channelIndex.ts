import * as catalogRepository from '@/db/repositories/catalogRepository';
import { detectQuality, isSeparatorOrEvent } from '@/services/live/channelNormalizer';
import type { LiveChannel } from '@/types/models';
import { tvChannelKey } from './tvChannels';

/**
 * Index « chaine TV FR -> chaine du bouquet Xtream » (une fois par session).
 *
 * Construit a partir du pool Live FR (borne) : cle tvChannelKey ->
 * meilleure version (qualite). Permet de transformer « Canal+ Live 7 » (guide)
 * en la chaine jouable « FR| CANAL+ LIVE 7 FHD » en O(1). Invalide quand le
 * nombre de chaines FR change (resynchronisation).
 */

export interface ChannelRef {
  id: string;
  name: string;
}

const POOL_CAP = 6000;

let cached: { size: number; index: Map<string, ChannelRef & { score: number }> } | null = null;
let building: Promise<Map<string, ChannelRef & { score: number }>> | null = null;

async function build(size: number): Promise<Map<string, ChannelRef & { score: number }>> {
  const pool: LiveChannel[] = await catalogRepository.getLiveChannelsPage({ kind: 'french' }, 0, POOL_CAP);
  const index = new Map<string, ChannelRef & { score: number }>();
  for (const c of pool) {
    if (isSeparatorOrEvent(c.name)) continue;
    const key = tvChannelKey(c.name);
    if (key.length < 2) continue;
    const quality = detectQuality(c.name);
    // Les flux « backup » ne sont choisis qu'a defaut.
    const score = quality.quality === 'BACKUP' ? 1 : quality.score;
    const existing = index.get(key);
    if (existing === undefined || score > existing.score) index.set(key, { id: c.id, name: c.name, score });
  }
  cached = { size, index };
  return index;
}

async function getIndex(): Promise<Map<string, ChannelRef & { score: number }>> {
  const size = await catalogRepository.countLiveChannels({ kind: 'french' });
  if (cached !== null && cached.size === size) return cached.index;
  if (building === null) {
    building = build(size).finally(() => {
      building = null;
    });
  }
  return building;
}

/** Chaine du bouquet correspondant a un nom de chaine TV FR, sinon null. */
export async function findBouquetChannel(display: string): Promise<ChannelRef | null> {
  const hit = (await getIndex()).get(tvChannelKey(display));
  return hit !== undefined ? { id: hit.id, name: hit.name } : null;
}

/** Version groupee (une seule lecture de l'index). */
export async function findBouquetChannels(displays: string[]): Promise<(ChannelRef | null)[]> {
  const index = await getIndex();
  return displays.map((d) => {
    const hit = index.get(tvChannelKey(d));
    return hit !== undefined ? { id: hit.id, name: hit.name } : null;
  });
}
