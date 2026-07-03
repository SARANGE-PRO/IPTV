/**
 * Modeles internes NORMALISES — seule forme consommee par stores, services et
 * composants. La conversion depuis les types bruts (types/xtream.ts) sera
 * faite par services/xtream/normalize.ts (etape 4).
 *
 * Conventions :
 * - Tous les ids internes sont des `string` (ids numeriques Xtream
 *   stringifies) ; les URLs de lecture se construisent directement avec.
 * - `categoryId` est toujours defini ('0' si contenu non classe), sinon les
 *   entrees sortiraient de l'index categoryId.
 * - Timestamps en millisecondes epoch (champs *At).
 * - IndexedDB ne sait pas indexer les booleens : les champs booleens INDEXES
 *   (isFrench, finished) sont stockes en 0 | 1 (`BoolNum`). Les booleens non
 *   indexes (ex. rememberMe) restent des `boolean`.
 */

export type Section = 'live' | 'vod' | 'series';

/** Types referencables par favoris/historique — inclut l'episode unitaire. */
export type MediaType = 'live' | 'vod' | 'series' | 'episode';

/** Booleen indexable IndexedDB (0 = false, 1 = true). */
export type BoolNum = 0 | 1;

// --- Catalogue -----------------------------------------------------------------

export interface Category {
  /** category_id Xtream stringifie. */
  id: string;
  section: Section;
  name: string;
  /** Minuscules sans accents — recherche et tri stables. */
  normalizedName: string;
  isFrench: BoolNum;
  /** Pays detecte (ISO-3166 alpha-2) ou null. */
  country: string | null;
  /** Langue detectee (ISO-639-1) ou null. */
  language: string | null;
}

export interface LiveChannel {
  /** stream_id stringifie — utilise tel quel dans l'URL de lecture. */
  id: string;
  categoryId: string;
  name: string;
  normalizedName: string;
  logoUrl: string | null;
  epgChannelId: string | null;
  /** Ordre fournisseur (champ num) — tri d'affichage par defaut. */
  sortOrder: number;
  isFrench: BoolNum;
  country: string | null;
  language: string | null;
}

export interface Movie {
  /** stream_id stringifie. */
  id: string;
  categoryId: string;
  name: string;
  normalizedName: string;
  posterUrl: string | null;
  /** Extension de conteneur ("mp4", "mkv"...) pour l'URL de lecture. */
  containerExtension: string | null;
  /** Note sur 10 si connue. */
  rating: number | null;
  year: number | null;
  /** Date d'ajout cote panel (ms). null = absent de l'index "recents". */
  addedAt: number | null;
  isFrench: BoolNum;
  country: string | null;
  language: string | null;
}

export interface Series {
  /** series_id stringifie. */
  id: string;
  categoryId: string;
  name: string;
  normalizedName: string;
  posterUrl: string | null;
  backdropUrl: string | null;
  plot: string | null;
  genre: string | null;
  releaseDate: string | null;
  rating: number | null;
  /** Derniere modification cote panel (ms). null = absent de l'index "recents". */
  lastModifiedAt: number | null;
  isFrench: BoolNum;
  country: string | null;
  language: string | null;
}

export interface Season {
  seasonNumber: number;
  name: string;
  episodeCount: number;
  coverUrl: string | null;
  airDate: string | null;
}

export interface Episode {
  /** Id d'episode Xtream stringifie — sert a l'URL de lecture. */
  id: string;
  seasonNumber: number;
  episodeNumber: number;
  title: string;
  containerExtension: string | null;
  durationSecs: number | null;
  plot: string | null;
  imageUrl: string | null;
}

/** Detail d'une serie — un document par serie, episodes a plat. */
export interface SeriesDetails {
  /** = Series.id */
  seriesId: string;
  seasons: Season[];
  episodes: Episode[];
  /** Pilote le TTL du detail (ms). */
  fetchedAt: number;
}

// --- Donnees utilisateur ----------------------------------------------------------

export interface FavoriteEntry {
  type: MediaType;
  itemId: string;
  addedAt: number;
}

export interface PlaybackEntry {
  type: MediaType;
  /** vod/live : id catalogue ; episode : id d'episode. */
  itemId: string;
  /** Renseigne quand type = 'episode' (regroupement par serie). */
  seriesId: string | null;
  positionSec: number;
  durationSec: number | null;
  finished: BoolNum;
  updatedAt: number;
  /** Denormalises pour afficher "Continuer a regarder" sans jointure. */
  label: string | null;
  posterUrl: string | null;
}

export type SessionStatus = 'valid' | 'invalid' | 'unknown';

/**
 * Session locale MINIMALE (amendement valide) : `password` n'est present que
 * si "Se souvenir de moi" est active. Ecrite uniquement via
 * secureSessionService (etape 2).
 */
export interface SessionRecord {
  id: 'active';
  serverUrl: string;
  username: string;
  password?: string;
  rememberMe: boolean;
  createdAt: number;
  lastValidatedAt: number;
  sessionStatus: SessionStatus;
}

// --- Cache TMDB ---------------------------------------------------------------------

export interface TmdbCastMember {
  name: string;
  character: string | null;
}

export interface TmdbMetadata {
  tmdbId: number;
  title: string;
  overview: string | null;
  /** Fragments TMDB (jamais d'URL complete) — la taille d'image est choisie a l'affichage. */
  posterPath: string | null;
  backdropPath: string | null;
  releaseDate: string | null;
  voteAverage: number | null;
  genres: string[];
  runtimeMinutes: number | null;
  cast: TmdbCastMember[];
}

export interface TmdbCacheEntry {
  /** Cle derivee du titre nettoye (+ annee) — derivation definie a l'etape 9. */
  key: string;
  type: 'movie' | 'tv';
  /** 'notfound' est aussi mis en cache (data: null) pour eviter les re-requetes. */
  status: 'found' | 'notfound';
  data: TmdbMetadata | null;
  fetchedAt: number;
}

// --- Preferences & maintenance --------------------------------------------------------

export interface HiddenCategoryEntry {
  section: Section;
  categoryId: string;
  /** Libelle conserve pour la liste de reactivation (sans jointure). */
  label: string;
  hiddenAt: number;
}

export interface SettingEntry {
  key: string;
  value: unknown;
}

export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error';

export interface SyncMetadataEntry {
  section: Section;
  status: SyncStatus;
  /** Derniere sync complete reussie (ms) — pilote le TTL. */
  lastFetchAt: number | null;
  lastAttemptAt: number | null;
  categoryCount: number;
  itemCount: number;
  error: string | null;
}

export interface SearchIndexEntry {
  /** Token normalise (minuscules, sans accents). */
  token: string;
  /** Postings compacts "type:id", ex. "vod:5021". */
  refs: string[];
}
