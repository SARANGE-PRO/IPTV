/**
 * Types BRUTS de l'API Xtream Codes (player_api.php), avant normalisation.
 *
 * L'API Xtream est notoirement inconsistante d'un panel a l'autre : beaucoup
 * de champs arrivent tantot en string, tantot en number. Ces champs sont
 * types `NumLike` et seront coerces par la couche de normalisation
 * (services/xtream/normalize.ts, etape 4).
 *
 * Ces types ne doivent JAMAIS fuiter vers l'UI : les composants consomment
 * exclusivement les modeles internes (types/models.ts).
 */

/** Valeur numerique parfois renvoyee sous forme de chaine par les panels. */
export type NumLike = number | string;

/** Identifiants saisis au login — persistes uniquement via secureSessionService. */
export interface XtreamCredentials {
  serverUrl: string;
  username: string;
  password: string;
}

// --- Authentification (player_api.php sans action) ---------------------------

export interface XtreamUserInfo {
  username: string;
  message?: string;
  /** 1 = authentifie. Certains panels renvoient un booleen. */
  auth: NumLike | boolean;
  /** "Active", "Expired", "Banned", "Disabled"... */
  status: string;
  exp_date: NumLike | null;
  is_trial?: NumLike;
  active_cons?: NumLike;
  created_at?: NumLike;
  max_connections?: NumLike;
  allowed_output_formats?: string[];
}

export interface XtreamServerInfo {
  url: string;
  port: NumLike;
  https_port?: NumLike;
  server_protocol?: string; // "http" | "https"
  rtmp_port?: NumLike;
  timezone?: string;
  timestamp_now?: NumLike;
  time_now?: string;
}

export interface XtreamAuthResponse {
  user_info: XtreamUserInfo;
  server_info?: XtreamServerInfo;
}

// --- Categories (get_live_categories / get_vod_categories / get_series_categories)

export interface XtreamCategory {
  category_id: NumLike;
  category_name: string;
  parent_id?: NumLike;
}

// --- Live (get_live_streams) --------------------------------------------------

export interface XtreamLiveStream {
  num: NumLike;
  name: string;
  stream_type?: string; // "live"
  stream_id: NumLike;
  stream_icon?: string | null;
  epg_channel_id?: string | null;
  /** Epoch secondes, en string sur la plupart des panels. */
  added?: NumLike;
  category_id: NumLike | null;
  category_ids?: number[];
  custom_sid?: string | null;
  tv_archive?: NumLike;
  tv_archive_duration?: NumLike;
  direct_source?: string;
  thumbnail?: string;
}

// --- VOD (get_vod_streams / get_vod_info) --------------------------------------

export interface XtreamVodStream {
  num: NumLike;
  name: string;
  title?: string;
  year?: NumLike | null;
  stream_type?: string; // "movie"
  stream_id: NumLike;
  stream_icon?: string | null;
  /** Note sur 10, souvent en string. */
  rating?: NumLike | null;
  rating_5based?: NumLike | null;
  added?: NumLike;
  category_id: NumLike | null;
  container_extension?: string; // "mp4", "mkv"...
  custom_sid?: string | null;
  direct_source?: string;
  /** Certains panels exposent directement l'id TMDB. */
  tmdb?: NumLike;
}

/** Reponse de get_vod_info (detail d'un film). */
export interface XtreamVodInfo {
  info?: {
    name?: string;
    o_name?: string;
    movie_image?: string;
    cover?: string;
    tmdb_id?: NumLike;
    releasedate?: string;
    youtube_trailer?: string;
    director?: string;
    actors?: string;
    cast?: string;
    plot?: string;
    description?: string;
    genre?: string;
    duration_secs?: NumLike;
    duration?: string; // "01:52:00"
    rating?: NumLike;
    backdrop_path?: string[] | string;
  };
  movie_data?: {
    stream_id: NumLike;
    name: string;
    added?: NumLike;
    category_id?: NumLike;
    container_extension?: string;
  };
}

// --- Series (get_series / get_series_info) --------------------------------------

export interface XtreamSeries {
  num?: NumLike;
  name: string;
  series_id: NumLike;
  cover?: string | null;
  plot?: string | null;
  cast?: string | null;
  director?: string | null;
  genre?: string | null;
  releaseDate?: string | null;
  /** Variante de nommage selon les panels. */
  release_date?: string | null;
  /** Epoch secondes. */
  last_modified?: NumLike;
  rating?: NumLike | null;
  rating_5based?: NumLike | null;
  backdrop_path?: string[] | string | null;
  youtube_trailer?: string | null;
  episode_run_time?: NumLike | null;
  category_id: NumLike | null;
}

export interface XtreamSeason {
  id?: NumLike;
  season_number: NumLike;
  name?: string;
  overview?: string;
  air_date?: string | null;
  episode_count?: NumLike;
  cover?: string | null;
  cover_big?: string | null;
}

export interface XtreamEpisodeInfo {
  movie_image?: string | null;
  plot?: string | null;
  releasedate?: string | null;
  duration_secs?: NumLike | null;
  duration?: string | null;
  rating?: NumLike | null;
  season?: NumLike;
  tmdb_id?: NumLike;
}

export interface XtreamEpisode {
  /** Id du flux episode — sert a construire l'URL de lecture. */
  id: NumLike;
  episode_num: NumLike;
  title?: string;
  container_extension?: string;
  season?: NumLike;
  added?: NumLike;
  custom_sid?: string | null;
  direct_source?: string;
  info?: XtreamEpisodeInfo;
}

/**
 * Reponse de get_series_info. Selon les panels, `episodes` est un objet
 * indexe par numero de saison OU un tableau de tableaux — le normaliseur
 * (etape 4) devra gerer les deux formes.
 */
export interface XtreamSeriesInfo {
  seasons?: XtreamSeason[];
  info?: Partial<XtreamSeries>;
  episodes?: Record<string, XtreamEpisode[]> | XtreamEpisode[][];
}
