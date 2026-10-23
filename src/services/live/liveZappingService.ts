import * as catalogRepository from '@/db/repositories/catalogRepository';
import { findChannelVersions } from '@/services/live/channelGroupingService';
import { isSeparatorOrEvent } from '@/services/live/channelNormalizer';
import type { ChannelVersion } from '@/types/liveGrouping';
import type { LiveChannel } from '@/types/models';

/**
 * Zapping Live : chaines voisines JOUABLES et versions (HD/FHD/4K…) d'une
 * chaine, sans relire des milliers de lignes Dexie a chaque changement de
 * chaine (sur iPhone, ca retardait le demarrage du flux suivant).
 */

/** Meme borne que les vues FR de la page Live : jamais les 55k en memoire. */
export const FRENCH_POOL_CAP = 4000;
/** Cache court : le pool ne change qu'a la synchro (qui l'invalide aussi). */
const POOL_TTL_MS = 3 * 60_000;
/** Chaines lues de chaque cote pour sauter separateurs et evenements vides. */
const NEIGHBOR_WINDOW = 12;

let pool: { at: number; rows: Promise<LiveChannel[]> } | null = null;

/** Pool FR borne, partage par la liste Live et le lecteur. */
export function getFrenchLivePool(): Promise<LiveChannel[]> {
  const now = Date.now();
  if (pool === null || now - pool.at > POOL_TTL_MS) {
    const rows = catalogRepository.getLiveChannelsPage({ kind: 'french' }, 0, FRENCH_POOL_CAP);
    const entry = { at: now, rows };
    pool = entry;
    // Un echec de lecture (stockage) ne doit pas rester en cache.
    rows.catch(() => {
      if (pool === entry) pool = null;
    });
  }
  return pool.rows;
}

/** Le catalogue Live vient de changer (synchro) : le pool est perime. */
export function invalidateLivePool(): void {
  pool = null;
}

/** Versions de la chaine (FR uniquement : l'international reste « en vrac »). */
export async function getChannelVersions(channel: LiveChannel): Promise<ChannelVersion[]> {
  if (channel.isFrench !== 1) return [];
  return findChannelVersions(await getFrenchLivePool(), channel);
}

function playable(candidate: LiveChannel, currentId: string): boolean {
  return candidate.id !== currentId && !isSeparatorOrEvent(candidate.name);
}

/**
 * Chaine precedente / suivante dans la categorie, en sautant les separateurs
 * (« ----- FRANCE ----- ») et les evenements vides qui n'ont pas de flux ; en
 * bout de categorie on reboucle, comme une telecommande.
 */
export async function getZapNeighbors(
  channel: LiveChannel,
): Promise<{ previous: LiveChannel | null; next: LiveChannel | null }> {
  const { before, after } = await catalogRepository.getLiveChannelsAround(
    channel.categoryId,
    channel.sortOrder,
    NEIGHBOR_WINDOW,
  );
  let previous = before.find((c) => playable(c, channel.id)) ?? null;
  let next = after.find((c) => playable(c, channel.id)) ?? null;
  if (previous === null) {
    const tail = await catalogRepository.getLiveCategoryEdge(channel.categoryId, 'end', NEIGHBOR_WINDOW);
    previous = tail.find((c) => playable(c, channel.id)) ?? null;
  }
  if (next === null) {
    const head = await catalogRepository.getLiveCategoryEdge(channel.categoryId, 'start', NEIGHBOR_WINDOW);
    next = head.find((c) => playable(c, channel.id)) ?? null;
  }
  return { previous, next };
}
