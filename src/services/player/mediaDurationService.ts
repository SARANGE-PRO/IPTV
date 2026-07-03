import type { DurationInfo } from '@/types/playbackCapabilities';

/**
 * Resolution de la duree d'un media VOD/episode. Strategie multi-niveaux :
 * duree native du player -> duree Xtream -> duree TMDB -> inconnue. Aucune
 * analyse reseau : on ne lit que des metadonnees deja disponibles.
 */

/** Parse une duree Xtream heterogene (secondes num, "HH:mm:ss", "mm:ss"...). */
export function parseDurationToSeconds(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? Math.round(value) : null;

  const raw = value.trim();
  if (raw === '') return null;

  // Format horloge "H:mm:ss" / "mm:ss".
  if (/^\d{1,2}(:\d{1,2}){1,2}$/.test(raw)) {
    const parts = raw.split(':').map((p) => Number(p));
    if (parts.some((p) => !Number.isFinite(p))) return null;
    const seconds = parts.reduce((acc, part) => acc * 60 + part, 0);
    return seconds > 0 ? seconds : null;
  }

  // Nombre pur en secondes (eventuellement en string).
  const asNumber = Number(raw);
  if (Number.isFinite(asNumber) && asNumber > 0) return Math.round(asNumber);
  return null;
}

/** Duree native fiable uniquement si finie et > 0 (jamais Infinity/NaN/0). */
export function nativeDurationSeconds(duration: number): number | null {
  return Number.isFinite(duration) && duration > 0 ? duration : null;
}

/**
 * Choisit la meilleure duree connue et sa provenance. `tmdb` est une duree
 * theorique (fallback affichage), jamais presentee comme exacte.
 */
export function resolveDuration(sources: {
  nativeSeconds?: number | null;
  xtreamSeconds?: number | null;
  tmdbSeconds?: number | null;
}): DurationInfo {
  if (sources.nativeSeconds != null && sources.nativeSeconds > 0) {
    return { seconds: sources.nativeSeconds, source: 'native' };
  }
  if (sources.xtreamSeconds != null && sources.xtreamSeconds > 0) {
    return { seconds: sources.xtreamSeconds, source: 'xtream' };
  }
  if (sources.tmdbSeconds != null && sources.tmdbSeconds > 0) {
    return { seconds: sources.tmdbSeconds, source: 'tmdb' };
  }
  return { seconds: null, source: 'unknown' };
}
