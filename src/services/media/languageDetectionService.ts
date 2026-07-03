import type { FrenchVariant, MediaLanguage } from '@/types/mediaLanguage';
import { normalizeText } from '@/utils/text';

/**
 * Detection de langue/variante depuis les metadonnees IPTV (titre + categorie).
 * On privilegie les TAGS IPTV explicites (VF/VOSTFR/MULTI/TRUEFRENCH) plutot que
 * les mots reels pour eviter les faux positifs (ex. "The French Dispatch").
 */

// Tags fiables (IPTV), jamais des mots courants.
const TAG_MULTI = /\bmulti\b/;
const TAG_VF = /\b(vf|vff|vfq|vf2|truefrench|vostf)\b/;
const TAG_VOSTFR = /\b(vostfr|subfrench|vost)\b/;

/** Variante francophone mise en avant sur les cartes (VF/MULTI/VOSTFR) ou null. */
export function detectFrenchVariant(name: string): FrenchVariant | null {
  const n = ` ${normalizeText(name)} `;
  if (TAG_MULTI.test(n)) return 'MULTI';
  if (TAG_VOSTFR.test(n)) return 'VOSTFR';
  if (TAG_VF.test(n)) return 'VF';
  return null;
}

/** Vrai si le contenu a (probablement) une piste audio francaise. */
export function hasFrenchAudio(name: string): boolean {
  const variant = detectFrenchVariant(name);
  return variant === 'VF' || variant === 'MULTI';
}

// Code pays/langue en tete de categorie ("FR - ", "EN - ", "DE|", "PT/BR -").
const CATEGORY_PREFIX = /^\s*([a-z]{2})(?:[\/-][a-z]{2})?\s*[|:\-–]/;
const PREFIX_LANG: Record<string, MediaLanguage> = {
  fr: 'VF',
  en: 'EN',
  us: 'EN',
  uk: 'EN',
  es: 'ES',
  de: 'DE',
  it: 'IT',
  pt: 'PT',
  br: 'PT',
  ar: 'AR',
};

/**
 * Langue globale approximative (pour le diagnostic) : tag titre fort d'abord,
 * sinon prefixe de categorie, sinon OTHER.
 */
export function detectLanguage(name: string, categoryName: string | null): MediaLanguage {
  const variant = detectFrenchVariant(name);
  if (variant !== null) return variant;
  if (categoryName !== null) {
    const match = CATEGORY_PREFIX.exec(normalizeText(categoryName));
    const code = match?.[1];
    if (code !== undefined && PREFIX_LANG[code] !== undefined) return PREFIX_LANG[code];
  }
  return 'OTHER';
}
