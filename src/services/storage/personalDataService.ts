import { personalDb } from '@/db/personalDb';

/**
 * Sauvegarde des donnees PERSONNELLES (favoris, onglets, progression, chaines
 * masquees, rappels, reglages) en un fichier JSON. En HTTP (coquille), iOS
 * n'accorde pas le stockage protege : sans ce fichier, une purge du stockage
 * les perdrait. Le catalogue n'y est pas (une synchro le reconstruit).
 *
 * JAMAIS d'identifiants : la table `sessions` est exclue, comme les caches.
 */

const FORMAT = 'zibtv-backup';
const VERSION = 1;

/** Tables exportees (cles = noms Dexie). */
const TABLES = [
  'favorites',
  'favorite_tabs',
  'favorite_tab_items',
  'playback_history',
  'hidden_categories',
  'reminders',
  'settings',
] as const;
type BackupTable = (typeof TABLES)[number];

/** Reglages qui ne sont que des caches (recalcules seuls, volumineux). */
const CACHE_SETTINGS: ReadonlySet<string> = new Set(['tvSchedule', 'liveLineupMeta']);

export interface PersonalBackup {
  format: typeof FORMAT;
  version: number;
  exportedAt: number;
  tables: Record<BackupTable, unknown[]>;
}

/** Tables du profil actif (le profil prive n'a ni categories masquees ni rappels : communs). */
function profileTables(): BackupTable[] {
  const names = new Set(personalDb().tables.map((t) => t.name));
  return TABLES.filter((name) => names.has(name));
}

export async function exportPersonalData(): Promise<PersonalBackup> {
  const entries = await Promise.all(
    profileTables().map(async (name) => [name, await personalDb().table(name).toArray()] as const),
  );
  const tables = { ...Object.fromEntries(TABLES.map((n) => [n, []])), ...Object.fromEntries(entries) } as Record<
    BackupTable,
    unknown[]
  >;
  tables.settings = tables.settings.filter(
    (row) => !CACHE_SETTINGS.has(String((row as { key?: unknown }).key ?? '')),
  );
  return { format: FORMAT, version: VERSION, exportedAt: Date.now(), tables };
}

/** Verifie la forme d'un fichier de sauvegarde ; null s'il n'en est pas un. */
export function parseBackup(raw: unknown): PersonalBackup | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const b = raw as Partial<PersonalBackup>;
  if (b.format !== FORMAT || typeof b.version !== 'number' || b.version > VERSION) return null;
  if (typeof b.tables !== 'object' || b.tables === null) return null;
  const tables = b.tables as Partial<Record<BackupTable, unknown>>;
  for (const name of TABLES) {
    const rows = tables[name];
    if (rows !== undefined && !Array.isArray(rows)) return null;
  }
  return b as PersonalBackup;
}

/**
 * Restaure une sauvegarde en FUSION (ajoute / remplace, ne supprime rien),
 * en une transaction : tout ou rien. Renvoie le nombre de lignes ecrites.
 */
export async function importPersonalData(backup: PersonalBackup): Promise<number> {
  let written = 0;
  const names = profileTables();
  await personalDb().transaction('rw', names.map((name) => personalDb().table(name)), async () => {
    for (const name of names) {
      const rows = (backup.tables[name] ?? []).filter((row) => typeof row === 'object' && row !== null);
      if (rows.length === 0) continue;
      await personalDb().table(name).bulkPut(rows);
      written += rows.length;
    }
  });
  return written;
}
