import * as catalogRepository from '@/db/repositories/catalogRepository';
import { detectQuality } from '@/services/live/channelNormalizer';
import { detectFrenchVariant } from '@/services/media/languageDetectionService';
import type { Movie, Series } from '@/types/models';
import { displayTitle, displayYear } from '@/utils/displayTitle';
import { normalizeText } from '@/utils/text';

/**
 * Regroupement des VARIANTES DE LANGUE d'un meme film/serie.
 *
 * Constat diagnostic : le provider ne met PAS plusieurs pistes audio dans un
 * fichier — il DUPLIQUE les entrees du catalogue ("Film VF", "Film VOSTFR",
 * "Film MULTI"). Le "choix de piste audio" se joue donc au niveau CATALOGUE :
 * on retrouve les entrees soeurs (meme titre nettoye + meme annee, tag de langue
 * different) et on expose un selecteur qui change le flux lu.
 *
 * Requete CIBLEE a l'ouverture de la fiche (searchMovies/searchSeries) — jamais
 * un balayage massif en memoire (invariant #6).
 */

export type VariantTag = 'VF' | 'MULTI' | 'VOSTFR' | 'VO';

export interface LanguageVariant {
  id: string;
  name: string;
  containerExtension: string | null; // null pour les series
  tag: VariantTag;
  qualityLabel: string;
  qualityScore: number;
}

const TAG_ORDER: Record<VariantTag, number> = { VF: 0, MULTI: 1, VOSTFR: 2, VO: 3 };
export const VARIANT_LABEL: Record<VariantTag, string> = {
  VF: 'VF',
  MULTI: 'MULTI',
  VOSTFR: 'VOSTFR',
  VO: 'VO',
};

/** Titre de base normalise (sans tags langue/qualite/annee) — cle de regroupement. */
export function baseTitleKey(name: string): string {
  return normalizeText(displayTitle(name));
}

function variantTag(name: string): VariantTag {
  return detectFrenchVariant(name) ?? 'VO';
}

/** Choisit la meilleure entree par tag (qualite la plus haute) parmi les soeurs. */
function clusterVariants(
  entries: { id: string; name: string; container: string | null }[],
  baseKey: string,
  baseYear: number | null,
): LanguageVariant[] {
  const byTag = new Map<VariantTag, LanguageVariant>();
  for (const e of entries) {
    if (baseTitleKey(e.name) !== baseKey) continue;
    const year = displayYear(e.name, null);
    // Meme annee OU annee absente d'un cote : evite de fusionner deux films
    // homonymes d'annees differentes (remakes).
    if (baseYear !== null && year !== null && year !== baseYear) continue;
    const tag = variantTag(e.name);
    const q = detectQuality(e.name);
    const existing = byTag.get(tag);
    if (existing === undefined || q.score > existing.qualityScore) {
      byTag.set(tag, {
        id: e.id,
        name: e.name,
        containerExtension: e.container,
        tag,
        qualityLabel: q.label,
        qualityScore: q.score,
      });
    }
  }
  return [...byTag.values()].sort((a, b) => TAG_ORDER[a.tag] - TAG_ORDER[b.tag]);
}

/** Variantes de langue d'un film. Renvoie [] si une seule langue (rien a proposer). */
export async function findMovieVariants(movie: Movie): Promise<LanguageVariant[]> {
  const baseKey = baseTitleKey(movie.name);
  if (baseKey.length < 2) return [];
  const baseYear = displayYear(movie.name, movie.year);
  const candidates = await catalogRepository.searchMovies(displayTitle(movie.name), 80);
  const variants = clusterVariants(
    candidates.map((c) => ({ id: c.id, name: c.name, container: c.containerExtension })),
    baseKey,
    baseYear,
  );
  return variants.length >= 2 ? variants : [];
}

/** Variantes de langue d'une serie (entrees series soeurs). */
export async function findSeriesVariants(series: Series): Promise<LanguageVariant[]> {
  const baseKey = baseTitleKey(series.name);
  if (baseKey.length < 2) return [];
  const baseYear = displayYear(series.name, null);
  const candidates = await catalogRepository.searchSeries(displayTitle(series.name), 80);
  const variants = clusterVariants(
    candidates.map((c) => ({ id: c.id, name: c.name, container: null })),
    baseKey,
    baseYear,
  );
  return variants.length >= 2 ? variants : [];
}

/**
 * Tag de langue prefere de l'utilisateur (reglage) traduit en VariantTag.
 * Renvoie la variante correspondante, sinon celle ouverte, sinon la premiere.
 */
export function pickPreferredVariant(
  variants: LanguageVariant[],
  openedId: string,
  preferred: string,
): LanguageVariant | null {
  if (variants.length === 0) return null;
  const wanted: VariantTag =
    preferred === 'VF' ? 'VF' : preferred === 'MULTI' ? 'MULTI' : preferred === 'VOSTFR' ? 'VOSTFR' : 'VO';
  return (
    variants.find((v) => v.tag === wanted) ??
    variants.find((v) => v.id === openedId) ??
    variants[0] ??
    null
  );
}
