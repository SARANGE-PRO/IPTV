import { parseMediaTitle } from '@/utils/mediaTitle';

/**
 * Nettoyage des titres IPTV pour le matching TMDB — delegue au parseur unique
 * (utils/mediaTitle.ts) pour que titre affiche, titre cherche sur TMDB et cle
 * de regroupement soient toujours identiques.
 */

export interface CleanedTitle {
  title: string;
  year: number | null;
}

/** "FR - Interstellar (2014) MULTI 4K x265" -> { title: "Interstellar", year: 2014 }. */
export function cleanTitle(raw: string): CleanedTitle {
  const parsed = parseMediaTitle(raw);
  return { title: parsed.title, year: parsed.year };
}
