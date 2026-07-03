import { db } from '@/db/database';
import type { Section, SyncMetadataEntry } from '@/types/models';

/** Fraicheur du cache par section — pilote la strategie d'invalidation (TTL). */

function emptyEntry(section: Section): SyncMetadataEntry {
  return {
    section,
    status: 'idle',
    lastFetchAt: null,
    lastAttemptAt: null,
    categoryCount: 0,
    itemCount: 0,
    error: null,
  };
}

/** Metadonnees d'une section (entree par defaut si jamais synchronisee). */
export async function getSyncMetadata(section: Section): Promise<SyncMetadataEntry> {
  return (await db.sync_metadata.get(section)) ?? emptyEntry(section);
}

export function getAllSyncMetadata(): Promise<SyncMetadataEntry[]> {
  return db.sync_metadata.toArray();
}

export async function markSyncStart(section: Section): Promise<void> {
  const prev = await getSyncMetadata(section);
  await db.sync_metadata.put({
    ...prev,
    status: 'syncing',
    lastAttemptAt: Date.now(),
    error: null,
  });
}

export async function markSyncSuccess(
  section: Section,
  counts: { categoryCount: number; itemCount: number },
): Promise<void> {
  const prev = await getSyncMetadata(section);
  await db.sync_metadata.put({
    ...prev,
    ...counts,
    status: 'success',
    lastFetchAt: Date.now(),
    error: null,
  });
}

/** Echec de sync : conserve lastFetchAt et les comptes de la derniere reussite. */
export async function markSyncError(section: Section, message: string): Promise<void> {
  const prev = await getSyncMetadata(section);
  await db.sync_metadata.put({ ...prev, status: 'error', error: message });
}

/** Vrai si la section n'a jamais ete synchronisee ou si le TTL est depasse. */
export async function isStale(section: Section, ttlMs: number): Promise<boolean> {
  const meta = await getSyncMetadata(section);
  return meta.lastFetchAt === null || Date.now() - meta.lastFetchAt > ttlMs;
}

export async function clearSyncMetadata(): Promise<void> {
  await db.sync_metadata.clear();
}
