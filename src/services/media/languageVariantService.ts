import * as catalogRepository from '@/db/repositories/catalogRepository';
import type { MediaVariant, PreferredLanguage } from '@/types/mediaLanguage';
import type { Movie, Series } from '@/types/models';
import { parseMediaTitle } from '@/utils/mediaTitle';
import { variantOrder, variantRank } from '@/utils/variantPreference';

export { VARIANT_LABEL } from '@/utils/variantPreference';

/**
 * VERSIONS DE LANGUE d'un meme film/serie (selecteur de la fiche).
 *
 * Le provider ne met PAS plusieurs pistes audio dans un fichier : il DUPLIQUE
 * les entrees ("Film VF", "Film VOSTFR", "Film MULTI"). Depuis le chantier 2,
 * les entrees soeurs partagent une `groupKey` persistee (id TMDB sinon
 * titre+annee) : une requete d'index suffit, plus de recherche approximative.
 * On expose la meilleure version PAR VARIANTE (MP4 puis qualite), dans l'ordre
 * de preference de l'utilisateur.
 */

export type VariantTag = MediaVariant;

export interface LanguageVariant {
  id: string;
  name: string;
  containerExtension: string | null; // null pour les series
  tag: VariantTag;
  qualityLabel: string;
  qualityScore: number;
}

const NATIVE_CONTAINERS = new Set(['mp4', 'm4v', 'mov']);

interface Sibling {
  id: string;
  name: string;
  container: string | null;
  variant: MediaVariant;
  qualityScore: number;
  groupRank: number;
}

/** Meilleure entree par variante parmi les soeurs ; triees selon la preference. */
function clusterVariants(siblings: Sibling[], order: readonly MediaVariant[]): LanguageVariant[] {
  const byTag = new Map<MediaVariant, { variant: LanguageVariant; score: number }>();
  for (const s of siblings) {
    const native = NATIVE_CONTAINERS.has((s.container ?? '').toLowerCase()) ? 1000 : 0;
    const score = native + s.qualityScore - s.groupRank * 0.001;
    const existing = byTag.get(s.variant);
    if (existing === undefined || score > existing.score) {
      byTag.set(s.variant, {
        score,
        variant: {
          id: s.id,
          name: s.name,
          containerExtension: s.container,
          tag: s.variant,
          qualityLabel: parseMediaTitle(s.name).qualityLabel ?? 'Standard',
          qualityScore: s.qualityScore,
        },
      });
    }
  }
  return [...byTag.values()]
    .map((v) => v.variant)
    .sort((a, b) => variantRank(a.tag, order) - variantRank(b.tag, order));
}

/** Variantes de langue d'un film. Renvoie [] si une seule langue (rien a proposer). */
export async function findMovieVariants(movie: Movie, pref?: PreferredLanguage): Promise<LanguageVariant[]> {
  const rows = await catalogRepository.getMoviesByGroupKey(movie.groupKey);
  const variants = clusterVariants(
    rows.map((m) => ({
      id: m.id,
      name: m.name,
      container: m.containerExtension,
      variant: m.variant,
      qualityScore: m.qualityScore,
      groupRank: m.groupRank,
    })),
    variantOrder(pref),
  );
  return variants.length >= 2 ? variants : [];
}

/** Variantes de langue d'une serie (entrees series soeurs). */
export async function findSeriesVariants(series: Series, pref?: PreferredLanguage): Promise<LanguageVariant[]> {
  const rows = await catalogRepository.getSeriesByGroupKey(series.groupKey);
  const variants = clusterVariants(
    rows.map((s) => ({
      id: s.id,
      name: s.name,
      container: null,
      variant: s.variant,
      qualityScore: s.qualityScore,
      groupRank: s.groupRank,
    })),
    variantOrder(pref),
  );
  return variants.length >= 2 ? variants : [];
}

/**
 * Variante a ouvrir selon la preference : la premiere de l'ordre de preference
 * disponible, sinon celle ouverte, sinon la premiere.
 */
export function pickPreferredVariant(
  variants: LanguageVariant[],
  openedId: string,
  preferred: PreferredLanguage,
): LanguageVariant | null {
  if (variants.length === 0) return null;
  const order = variantOrder(preferred);
  for (const wanted of order) {
    const hit = variants.find((v) => v.tag === wanted);
    if (hit !== undefined) return hit;
  }
  return variants.find((v) => v.id === openedId) ?? variants[0] ?? null;
}
