import Dexie, { type Table } from 'dexie';
import { db } from '@/db/database';
import { isPrivateProfile } from '@/db/profile';
import type { FavoriteEntry, FavoriteTab, FavoriteTabItem, MediaType, PlaybackEntry, SettingEntry } from '@/types/models';

/**
 * Donnees PERSONNELLES (favoris, onglets, progression/recentes, reglages
 * personnels) : base normale, ou base PRIVEE distincte en mode prive. Le
 * catalogue, les caches et les reglages de l'app restent communs (`db`).
 *
 * Base a part (et non une colonne « profil ») : la base normale n'est ni
 * migree ni touchee ; les deux profils ne peuvent pas se melanger.
 */
export interface PersonalTables {
  favorites: Table<FavoriteEntry, [MediaType, string]>;
  playback_history: Table<PlaybackEntry, [MediaType, string]>;
  favorite_tabs: Table<FavoriteTab, string>;
  favorite_tab_items: Table<FavoriteTabItem, [string, MediaType, string]>;
  settings: Table<SettingEntry, string>;
}
export type PersonalDb = Dexie & PersonalTables;

/** Memes schemas que la base normale pour ces tables. */
class PrivateDatabase extends Dexie {
  favorites!: Table<FavoriteEntry, [MediaType, string]>;
  playback_history!: Table<PlaybackEntry, [MediaType, string]>;
  favorite_tabs!: Table<FavoriteTab, string>;
  favorite_tab_items!: Table<FavoriteTabItem, [string, MediaType, string]>;
  settings!: Table<SettingEntry, string>;

  constructor() {
    super('zibtv-prive');
    this.version(1).stores({
      favorites: '[type+itemId], type, addedAt',
      playback_history: '[type+itemId], type, updatedAt, finished',
      favorite_tabs: 'id, position',
      favorite_tab_items: '[tabId+type+itemId], tabId, [type+itemId]',
      settings: 'key',
    });
  }
}

let privateDb: PrivateDatabase | null = null;

/** Base des donnees personnelles du profil actif. */
export function personalDb(): PersonalDb {
  if (!isPrivateProfile()) return db;
  privateDb ??= new PrivateDatabase();
  return privateDb;
}
