import { db } from '@/db/database';
import type { SettingEntry } from '@/types/models';

/**
 * Paires cle/valeur typees a l'appel. Le type T n'est PAS verifie a
 * l'execution : l'appelant (settingsStore, etape 11) doit lire avec le meme
 * type qu'a l'ecriture.
 */

export async function getSetting<T>(key: string): Promise<T | undefined> {
  const row = await db.settings.get(key);
  return row === undefined ? undefined : (row.value as T);
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  await db.settings.put({ key, value });
}

export async function removeSetting(key: string): Promise<void> {
  await db.settings.delete(key);
}

export function getAllSettings(): Promise<SettingEntry[]> {
  return db.settings.toArray();
}

export async function clearSettings(): Promise<void> {
  await db.settings.clear();
}
