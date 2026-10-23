/** Types partages transverses. */

/** Etat de chargement generique pour les vues (loading / empty / error). */
export type LoadState = 'idle' | 'loading' | 'ready' | 'error' | 'empty';

export type {
  Section,
  MediaType,
  BoolNum,
  Category,
  LiveChannel,
  Movie,
  Series,
  Season,
  Episode,
  SeriesDetails,
  FavoriteEntry,
  FavoriteTab,
  FavoriteTabItem,
  PlaybackEntry,
  SessionRecord,
  SessionStatus,
  TmdbCastMember,
  TmdbMetadata,
  TmdbCacheEntry,
  HiddenCategoryEntry,
  SettingEntry,
  SyncMetadataEntry,
  SyncStatus,
  SearchIndexEntry,
} from './models';
