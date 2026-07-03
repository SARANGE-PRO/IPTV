import { QUALITY_TAGS } from '@/config/constants';
import type { TitleQuality } from '@/types/advancedDiagnostics';
import type { Section } from '@/types/models';
import { tokenizeLabel } from '@/utils/text';
import { cleanTitle } from '@/utils/titleCleaner';

/** Qualite des titres IPTV (echantillon) : tags parasites, annees, bruit, matchabilite. */

const QUALITY_SET = new Set<string>(QUALITY_TAGS.map((t) => t.replace(/[^a-z0-9]/g, '')));
const LANG_TAGS = new Set(['vf', 'vff', 'vfq', 'vostfr', 'multi', 'truefrench', 'vo', 'vost']);

export interface TitleQualityAccumulator {
  section: Section;
  sampled: number;
  withQualityTags: number;
  withLanguageTags: number;
  withYearInTitle: number;
  noisy: number;
  likelyUnmatchable: number;
  missingImage: number;
}

export function newTitleAccumulator(section: Section): TitleQualityAccumulator {
  return {
    section,
    sampled: 0,
    withQualityTags: 0,
    withLanguageTags: 0,
    withYearInTitle: 0,
    noisy: 0,
    likelyUnmatchable: 0,
    missingImage: 0,
  };
}

/** Agrege un titre dans l'accumulateur (appele au fil du curseur, sans stockage). */
export function accumulateTitle(acc: TitleQualityAccumulator, name: string, posterUrl: string | null): void {
  acc.sampled += 1;
  const tokens = tokenizeLabel(name);
  const qualityHits = tokens.filter((t) => QUALITY_SET.has(t)).length;
  const langHits = tokens.filter((t) => LANG_TAGS.has(t)).length;
  if (qualityHits > 0) acc.withQualityTags += 1;
  if (langHits > 0) acc.withLanguageTags += 1;
  if (/\b(?:19|20)\d{2}\b/.test(name)) acc.withYearInTitle += 1;
  if (qualityHits + langHits >= 3) acc.noisy += 1;

  const cleaned = cleanTitle(name);
  if (cleaned.title.trim().length < 2) acc.likelyUnmatchable += 1;
  if (posterUrl === null || posterUrl === '') acc.missingImage += 1;
}

export function finalizeTitleQuality(acc: TitleQualityAccumulator): TitleQuality {
  return { ...acc };
}

/** Regles de nettoyage recommandees, deduites des stats agregees. */
export function recommendCleaningRules(accumulators: TitleQualityAccumulator[]): string[] {
  const rules = new Set<string>();
  const ratio = (n: number, d: number) => (d > 0 ? n / d : 0);
  for (const a of accumulators) {
    if (ratio(a.withQualityTags, a.sampled) > 0.2) {
      rules.add('Retirer les tags qualité/encodage (4K, FHD, HD, x264, x265, HEVC, WEB-DL, BluRay) avant affichage et matching TMDB.');
    }
    if (ratio(a.withLanguageTags, a.sampled) > 0.2) {
      rules.add('Extraire les tags de langue (VF, VOSTFR, MULTI, TRUEFRENCH) vers un badge dédié plutôt que de les laisser dans le titre.');
    }
    if (ratio(a.withYearInTitle, a.sampled) > 0.15) {
      rules.add('Isoler l’année du titre pour améliorer la précision TMDB et permettre un tri par année.');
    }
    if (ratio(a.noisy, a.sampled) > 0.1) {
      rules.add('Normaliser les titres très bruités (séparateurs multiples, points, préfixes pays) via un nettoyage renforcé.');
    }
    if (ratio(a.likelyUnmatchable, a.sampled) > 0.05) {
      rules.add('Prévoir un fallback propre pour les titres non matchables (affichage brut + monogramme, pas d’appel TMDB répété).');
    }
  }
  return [...rules];
}
