import Dexie, { type Table } from 'dexie';
import type { EpgEntry } from '@/types/epg';
import type {
  Category,
  FavoriteEntry,
  HiddenCategoryEntry,
  LiveChannel,
  MediaType,
  Movie,
  PlaybackEntry,
  Reminder,
  SearchIndexEntry,
  Section,
  Series,
  SeriesDetails,
  SessionRecord,
  SettingEntry,
  SyncMetadataEntry,
  TmdbCacheEntry,
} from '@/types/models';

/**
 * Base locale IndexedDB (Dexie) — SEULE couche autorisee a toucher IndexedDB.
 * Stores Zustand et composants passent obligatoirement par db/repositories/*.
 *
 * SSR : construire l'instance est sans effet cote serveur (Dexie n'ouvre la
 * base qu'a la premiere requete) ; les repositories ne s'appellent que cote
 * client.
 *
 * Schema v1 :
 * - Les booleens indexes (isFrench, finished) sont stockes 0|1 — IndexedDB
 *   n'indexe pas les booleens.
 * - Pas de table diagnostic_reports : rapports generes a la demande, jamais
 *   persistes (amendement valide).
 * - Toute evolution de schema = this.version(2).stores(...).upgrade(...),
 *   jamais de modification de la v1.
 */
export class IptvDatabase extends Dexie {
  sessions!: Table<SessionRecord, string>;
  xtream_live_categories!: Table<Category, string>;
  xtream_live_streams!: Table<LiveChannel, string>;
  xtream_vod_categories!: Table<Category, string>;
  xtream_vod_streams!: Table<Movie, string>;
  xtream_series_categories!: Table<Category, string>;
  xtream_series!: Table<Series, string>;
  xtream_series_details!: Table<SeriesDetails, string>;
  tmdb_cache!: Table<TmdbCacheEntry, string>;
  favorites!: Table<FavoriteEntry, [MediaType, string]>;
  playback_history!: Table<PlaybackEntry, [MediaType, string]>;
  hidden_categories!: Table<HiddenCategoryEntry, [Section, string]>;
  settings!: Table<SettingEntry, string>;
  sync_metadata!: Table<SyncMetadataEntry, Section>;
  search_index!: Table<SearchIndexEntry, string>;
  epg_cache!: Table<EpgEntry, string>;
  reminders!: Table<Reminder, string>;

  constructor() {
    super('iptv-pwa');
    this.version(1).stores({
      sessions: 'id',
      xtream_live_categories: 'id, name, isFrench',
      xtream_live_streams: 'id, categoryId, name, isFrench',
      xtream_vod_categories: 'id, name, isFrench',
      xtream_vod_streams: 'id, categoryId, name, addedAt, isFrench',
      xtream_series_categories: 'id, name, isFrench',
      xtream_series: 'id, categoryId, name, lastModifiedAt, isFrench',
      xtream_series_details: 'seriesId',
      tmdb_cache: 'key, type, fetchedAt',
      favorites: '[type+itemId], type, addedAt',
      playback_history: '[type+itemId], type, updatedAt, finished',
      hidden_categories: '[section+categoryId], section',
      settings: 'key',
      sync_metadata: 'section',
      search_index: 'token',
    });

    // v2 : index multiEntry de recherche (searchTokens) sur les tables d'items.
    // Les enregistrements v1 n'ont pas ce champ : une resynchronisation est
    // necessaire pour alimenter la recherche.
    this.version(2).stores({
      xtream_live_streams: 'id, categoryId, name, isFrench, *searchTokens',
      xtream_vod_streams: 'id, categoryId, name, addedAt, isFrench, *searchTokens',
      xtream_series: 'id, categoryId, name, lastModifiedAt, isFrench, *searchTokens',
    });

    // v3 : theme + isUhd sur les chaines Live (filtres rapides ergonomie Live).
    // Resynchronisation necessaire pour peupler ces champs.
    this.version(3).stores({
      xtream_live_streams: 'id, categoryId, name, isFrench, theme, isUhd, *searchTokens',
    });

    // v4 : tris bornes et zapping sans materialiser les gros catalogues.
    // Migration additive uniquement : les champs sont deja presents sur les
    // lignes normalisees, IndexedDB construit les nouveaux index sur place.
    this.version(4).stores({
      xtream_live_streams:
        'id, categoryId, name, isFrench, theme, isUhd, [categoryId+sortOrder], [theme+isFrench], *searchTokens',
      xtream_vod_streams:
        'id, categoryId, name, addedAt, rating, year, isFrench, [categoryId+normalizedName], [categoryId+addedAt], [categoryId+rating], [categoryId+year], [isFrench+addedAt], [isFrench+rating], *searchTokens',
      xtream_series:
        'id, categoryId, name, lastModifiedAt, rating, isFrench, [categoryId+normalizedName], [categoryId+lastModifiedAt], [categoryId+rating], [isFrench+lastModifiedAt], [isFrench+rating], *searchTokens',
    });

    // v5 : cache EPG (programme TV) par chaine — TTL court, jamais de flux.
    this.version(5).stores({
      epg_cache: 'id, fetchedAt',
    });

    // v6 : BACKFILL des index derives. Les v2-v4 ont ajoute searchTokens/theme/
    // isUhd/year/normalizedName SANS `.upgrade()` -> les lignes synchronisees
    // AVANT ces versions restaient hors de ces index (recherche/tri partiels),
    // et l'app ne resynchronise pas automatiquement. Recomputer ces champs ici
    // exigerait la logique de normalisation (couche services) -> inversion de
    // dependance interdite. On PURGE donc le catalogue + sync_metadata : la
    // prochaine synchronisation le reconstruit proprement, index complets.
    // Favoris / historique / reglages / session sont PRESERVES (tables distinctes).
    // Cout assume : une resync manuelle apres cette mise a jour.
    // PATTERN a suivre desormais : toute version qui ajoute un index derive doit
    // fournir un `.upgrade()` (backfill ou purge), jamais l'oublier.
    this.version(6)
      .stores({})
      .upgrade(async (tx) => {
        await Promise.all([
          tx.table('xtream_live_categories').clear(),
          tx.table('xtream_live_streams').clear(),
          tx.table('xtream_vod_categories').clear(),
          tx.table('xtream_vod_streams').clear(),
          tx.table('xtream_series_categories').clear(),
          tx.table('xtream_series').clear(),
          tx.table('xtream_series_details').clear(),
          tx.table('sync_metadata').clear(),
        ]);
      });

    // v7 : rappels utilisateur (evenements sport). Table additive, aucune
    // migration de donnees existantes -> pas de resync necessaire.
    this.version(7).stores({
      reminders: 'id, startAt, notifiedAt',
    });
  }
}

/** Instance unique partagee par tous les repositories. */
export const db = new IptvDatabase();
