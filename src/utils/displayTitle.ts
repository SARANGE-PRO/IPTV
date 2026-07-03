import { cleanTitle } from '@/utils/titleCleaner';

/**
 * Nettoyage AFFICHAGE (jamais persiste) — les catalogues IPTV grand public
 * saturent les noms de decorations unicode (ᴿᴬᵂ ⁶⁰ᶠᵖˢ ᴴᴰ ⱽᴵᴾ ⁴ᴷ ▶…) et,
 * pour ~85 % des films, de l'annee + tags qualite dans le titre. On reutilise
 * `cleanTitle` (deja eprouve pour le matching TMDB) pour un rendu premium.
 */

// Superscripts/subscripts, petites capitales modificatrices, formes geometriques,
// symboles divers (▶ ⱽᴵᴾ ᴿᴬᵂ ⁶⁰ᶠᵖˢ ⁴ᴷ ²³¹ …). Ranges Unicode explicites (\u).
const DECORATIVE =
  /[²³¹ʰ-˿ᴀ-ᶿⱠ-Ɀ⁰-₟①-⓿■-◿☀-➿]/g;

/** Retire les decorations unicode (ᴿᴬᵂ ⁶⁰ᶠᵖˢ ᴴᴰ ⱽᴵᴾ ⁴ᴷ ▶…) — partage. */
export function stripDecorative(raw: string): string {
  return raw.replace(DECORATIVE, '').replace(/\s{2,}/g, ' ').trim();
}

/** Titre film/serie nettoye (decorations + prefixe pays + tags qualite + annee). */
export function displayTitle(raw: string): string {
  const stripped = stripDecorative(raw);
  const { title } = cleanTitle(stripped);
  return title !== '' ? title : stripped !== '' ? stripped : raw.trim();
}

/** Annee du titre (frequente dans le nom Xtream) sinon la valeur de repli. */
export function displayYear(raw: string, fallback: number | null): number | null {
  return cleanTitle(raw).year ?? fallback;
}

/** Nom de chaine : on retire seulement les decorations (on garde HD, le pays, etc.). */
export function displayChannelName(raw: string): string {
  const cleaned = stripDecorative(raw);
  return cleaned !== '' ? cleaned : raw.trim();
}
