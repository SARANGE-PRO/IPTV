import { db } from '@/db/database';
import { personalDb } from '@/db/personalDb';
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

/**
 * Reglages PERSONNELS (recherches recentes, derniere vue, chaines apprises…) :
 * dans la base du profil actif — en mode prive, rien ne fuit vers le profil
 * normal. Les reglages de l'app (langue, lecteur…) restent dans `getSetting`.
 */
export async function getPersonalSetting<T>(key: string): Promise<T | undefined> {
  const row = await personalDb().settings.get(key);
  return row === undefined ? undefined : (row.value as T);
}

export async function setPersonalSetting<T>(key: string, value: T): Promise<void> {
  await personalDb().settings.put({ key, value });
}
