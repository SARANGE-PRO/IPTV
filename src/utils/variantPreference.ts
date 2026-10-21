import type { MediaVariant, PreferredLanguage, VariantSource } from '@/types/mediaLanguage';

/**
 * Ordre de preference des variantes de langue — brique PURE partagee par le
 * repository (tiers d'index), le service de regroupement (version
 * representative) et l'UI (pastilles). Une seule source de verite.
 */

export const DEFAULT_VARIANT_ORDER: readonly MediaVariant[] = ['VF', 'MULTI', 'VOSTFR', 'VO', 'OTHER'];

/** Variantes du plus au moins souhaite selon le reglage utilisateur. */
export function variantOrder(pref: PreferredLanguage | null | undefined): MediaVariant[] {
  switch (pref) {
    case 'MULTI':
      return ['MULTI', 'VF', 'VOSTFR', 'VO', 'OTHER'];
    case 'VOSTFR':
      return ['VOSTFR', 'MULTI', 'VF', 'VO', 'OTHER'];
    case 'EN':
    case 'ES':
    case 'DE':
    case 'IT':
    case 'PT':
      return ['VO', 'MULTI', 'VOSTFR', 'VF', 'OTHER'];
    default:
      return [...DEFAULT_VARIANT_ORDER];
  }
}

/** Rang d'une variante dans un ordre (0 = la plus souhaitee ; inconnue = derniere). */
export function variantRank(variant: MediaVariant, order: readonly MediaVariant[]): number {
  const idx = order.indexOf(variant);
  return idx === -1 ? order.length : idx;
}

/**
 * Pastille de langue affichee sur une carte : VF / MULTI / VOSTFR toujours,
 * « VO » seulement si le tag est explicite dans le titre, rien pour une langue
 * etrangere ou inconnue.
 */
export function variantBadge(variant: MediaVariant, source: VariantSource): string | null {
  if (variant === 'VF' || variant === 'MULTI' || variant === 'VOSTFR') return variant;
  if (variant === 'VO' && source === 2) return 'VO';
  return null;
}

/** Libelle long d'une variante (selecteur de version). */
export const VARIANT_LABEL: Record<MediaVariant, string> = {
  VF: 'VF',
  MULTI: 'MULTI',
  VOSTFR: 'VOSTFR',
  VO: 'VO',
  OTHER: 'Autre langue',
};
