import { db } from '@/db/database';
import type { LiveLineupEntry } from '@/types/liveLineup';
import type { LiveChannel } from '@/types/models';

/**
 * Grille des chaines FR (table `live_lineup`, schema v11). Ecrite d'un bloc par
 * services/live/frenchLineupService, lue dans l'ordre `sortKey`.
 */

const WRITE_CHUNK = 2000;

/** Parcourt les flux FR (`isFrench = 1`) sans les materialiser tous. */
export function forEachFrenchChannel(onRow: (channel: LiveChannel) => void): Promise<void> {
  return db.xtream_live_streams.where('isFrench').equals(1).each(onRow);
}

/** Remplace atomiquement toute la grille (jamais d'etat a moitie ecrit). */
export function replaceLineup(entries: LiveLineupEntry[]): Promise<void> {
  return db.transaction('rw', db.live_lineup, async () => {
    await db.live_lineup.clear();
    for (let i = 0; i < entries.length; i += WRITE_CHUNK) {
      await db.live_lineup.bulkAdd(entries.slice(i, i + WRITE_CHUNK));
    }
  });
}

/** Toute la grille, dans l'ordre d'affichage (versions adjacentes). */
export function getLineupOrdered(): Promise<LiveLineupEntry[]> {
  return db.live_lineup.orderBy('sortKey').toArray();
}

export function getLineupEntry(id: string): Promise<LiveLineupEntry | undefined> {
  return db.live_lineup.get(id);
}

export function getLineupEntries(ids: string[]): Promise<(LiveLineupEntry | undefined)[]> {
  return db.live_lineup.bulkGet(ids);
}

/** Toutes les versions d'une chaine logique (index `groupKey`). */
export function getLineupGroup(groupKey: string): Promise<LiveLineupEntry[]> {
  return db.live_lineup.where('groupKey').equals(groupKey).toArray();
}

export function countLineup(): Promise<number> {
  return db.live_lineup.count();
}

export function clearLineup(): Promise<void> {
  return db.live_lineup.clear();
}
