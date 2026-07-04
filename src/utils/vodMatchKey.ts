import { normalizeText } from '@/utils/text';

/**
 * Cle canonique AGRESSIVE pour rapprocher un titre TMDB ("Dune : Deuxième
 * Partie") d'un nom Xtream ("FR | Dune 2 : Deuxieme Partie (2024) [4K] VF").
 * Minuscules + sans accents -> retire tags qualite/langue/pays + annee ->
 * compacte en alphanumerique pur. Le matching final tolere une inclusion + une
 * annee proche (voir trendingService) car "dune" vs "dune2" ne sont pas egaux.
 */

const TAG_RE =
  /\b(fr|vf|vff|vfq|vf2|vfi|vo|vost|vostfr|multi|truefrench|fhd|uhd|hd|sd|4k|hevc|h264|h265|x264|x265|1080p|720p|480p|web|webrip|webdl|bluray|brrip|dvdrip|remux|hdlight)\b/g;

/** Cle compacte alphanumerique (sans tags, sans annee, sans ponctuation). */
export function vodMatchKey(title: string): string {
  return normalizeText(title)
    .replace(/\((?:19|20)\d{2}\)/g, ' ') // annee entre parentheses
    .replace(TAG_RE, ' ')
    .replace(/[^a-z0-9]+/g, '');
}

/** Rapprochement tolerant : cles egales, ou l'une prefixe/contient l'autre sur
 *  une longueur significative (gere "dune" vs "dune2deuxiemepartie"). */
export function vodKeysMatch(a: string, b: string): boolean {
  if (a === '' || b === '') return false;
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length < 6) return false; // trop court -> risque de faux positif
  return long.startsWith(short) || long.includes(short);
}
