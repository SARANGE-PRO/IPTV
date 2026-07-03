/** Provenance de la duree retenue pour un media VOD/episode. */
export type DurationSource = 'native' | 'xtream' | 'tmdb' | 'estimated' | 'unknown';

export interface DurationInfo {
  /** Duree totale en secondes, ou null si indisponible. */
  seconds: number | null;
  source: DurationSource;
}

/** Extension/conteneur detecte du flux lu. */
export type MediaExtension = 'mp4' | 'm3u8' | 'mkv' | 'ts' | 'avi' | 'other';
