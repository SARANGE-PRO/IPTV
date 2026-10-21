import { parseMediaTitle, stripDecorative } from '@/utils/mediaTitle';

/**
 * Nettoyage AFFICHAGE (jamais persiste) — delegue au parseur unique
 * (utils/mediaTitle.ts). Les catalogues IPTV saturent les noms de decorations
 * unicode (ᴿᴬᵂ ⁶⁰ᶠᵖˢ ᴴᴰ ⱽᴵᴾ ⁴ᴷ ▶…), d'annees et de tags langue/qualite.
 */

export { stripDecorative };

/** Titre film/serie nettoye (decorations + prefixe pays + tags + annee). */
export function displayTitle(raw: string): string {
  return parseMediaTitle(raw).title;
}

/** Annee du titre (frequente dans le nom Xtream) sinon la valeur de repli. */
export function displayYear(raw: string, fallback: number | null): number | null {
  return parseMediaTitle(raw).year ?? fallback;
}

/** Nom de chaine : on retire seulement les decorations (on garde HD, le pays, etc.). */
export function displayChannelName(raw: string): string {
  const cleaned = stripDecorative(raw);
  return cleaned !== '' ? cleaned : raw.trim();
}
