/**
 * Stockage persistant : demande au navigateur de ne pas purger IndexedDB sous
 * pression de stockage. Reduit les re-synchronisations surprises (iOS purge le
 * stockage des PWA peu utilisees). Best-effort, jamais bloquant.
 */

export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || navigator.storage?.persist === undefined) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export async function isStoragePersisted(): Promise<boolean> {
  try {
    return (await navigator.storage?.persisted?.()) ?? false;
  } catch {
    return false;
  }
}
