import type { FrenchVariant, MediaLanguage } from '@/types/mediaLanguage';
import { parseMediaTitle } from '@/utils/mediaTitle';
import { normalizeText } from '@/utils/text';

/**
 * Detection de langue/variante — facade DIAGNOSTIC au-dessus du parseur unique
 * (utils/mediaTitle.ts). Les films/series persistent desormais leur `variant`
 * a la normalisation : l'UI lit la ligne Dexie, elle n'appelle plus ceci.
 */

/** Variante francophone portee par le TITRE seul (VF/MULTI/VOSTFR) ou null. */
export function detectFrenchVariant(name: string): FrenchVariant | null {
  const parsed = parseMediaTitle(name);
  if (parsed.variantSource !== 2) return null;
  return parsed.variant === 'VF' || parsed.variant === 'MULTI' || parsed.variant === 'VOSTFR'
    ? parsed.variant
    : null;
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
