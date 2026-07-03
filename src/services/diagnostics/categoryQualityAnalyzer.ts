import type { CategoryAudit, GroupSuggestion } from '@/types/advancedDiagnostics';
import type { Category, Section } from '@/types/models';
import { tokenizeLabel } from '@/utils/text';

/** Audit des categories + suggestions de regroupements virtuels (par section). */

const ADULT_TOKENS = new Set(['adult', 'adultes', 'adulte', 'xxx', 'porn', 'porno', '18']);
const TOO_BROAD: Record<Section, number> = { live: 1500, vod: 4000, series: 1500 };

/** Regroupements virtuels proposes : nom -> mots-cles de detection. */
const GROUPS: Record<Section, { name: string; keywords: string[] }[]> = {
  vod: [
    { name: 'Films FR', keywords: ['fr', 'french', 'vf', 'vostfr', 'truefrench', 'francais'] },
    { name: 'Films récents', keywords: ['recent', 'nouveau', 'nouveaute', 'new', '2024', '2025', 'ajout'] },
    { name: 'Films enfants', keywords: ['enfant', 'kids', 'animation', 'anime', 'disney', 'dessin'] },
    { name: 'Films action', keywords: ['action', 'aventure', 'guerre'] },
    { name: 'Films comédie', keywords: ['comedie', 'comedy', 'humour'] },
    { name: 'Films thriller', keywords: ['thriller', 'policier', 'crime', 'suspense'] },
    { name: 'Films horreur', keywords: ['horreur', 'horror', 'epouvante'] },
  ],
  series: [
    { name: 'Séries FR', keywords: ['fr', 'french', 'vf', 'vostfr', 'truefrench', 'francais'] },
    { name: 'Séries récentes', keywords: ['recent', 'nouveau', 'new', '2024', '2025', 'ajout'] },
    { name: 'Séries enfants', keywords: ['enfant', 'kids', 'animation', 'anime'] },
  ],
  live: [
    { name: 'Live France', keywords: ['fr', 'france', 'francais', 'french'] },
    { name: 'Live Sports FR', keywords: ['sport', 'foot', 'bein', 'rmc', 'canal sport'] },
    { name: 'Live News FR', keywords: ['news', 'info', 'bfm', 'cnews', 'lci'] },
    { name: 'Live Cinéma FR', keywords: ['cinema', 'cine', 'film', 'canal+', 'ocs'] },
    { name: 'Live Kids FR', keywords: ['kids', 'enfant', 'junior', 'gulli', 'disney'] },
  ],
};

function hasAnyToken(tokens: Set<string>, keywords: string[]): boolean {
  return keywords.some((k) => {
    const kt = tokenizeLabel(k);
    return kt.every((t) => tokens.has(t)) && kt.length > 0;
  });
}

export function auditCategories(
  section: Section,
  categories: Category[],
  counts: Map<string, number>,
): CategoryAudit[] {
  const nameSeen = new Map<string, number>();
  for (const c of categories) nameSeen.set(c.normalizedName, (nameSeen.get(c.normalizedName) ?? 0) + 1);

  return categories.map((c) => {
    const count = counts.get(c.id) ?? 0;
    const tokens = new Set(tokenizeLabel(c.name));
    const issues: CategoryAudit['issues'] = [];
    if (count === 0) issues.push('empty');
    else if (count <= 2) issues.push('tiny');
    if (count > TOO_BROAD[section]) issues.push('too-broad');
    if ([...ADULT_TOKENS].some((t) => tokens.has(t))) issues.push('adult');
    if ((nameSeen.get(c.normalizedName) ?? 0) > 1) issues.push('duplicate');
    if (tokens.size === 0 || /^[^a-z0-9]+$/i.test(c.name.trim())) issues.push('mislabeled');
    if (c.isFrench === 0 && c.country !== null && c.country !== 'FR') issues.push('foreign');
    return {
      label: c.name,
      section,
      count,
      isFrench: c.isFrench === 1,
      detectedCountry: c.country,
      issues,
    };
  });
}

export function suggestGroups(
  section: Section,
  categories: Category[],
  counts: Map<string, number>,
): GroupSuggestion[] {
  const groups = GROUPS[section];
  const out: GroupSuggestion[] = [];
  for (const group of groups) {
    const matched: Category[] = categories.filter((c) => hasAnyToken(new Set(tokenizeLabel(c.name)), group.keywords));
    if (matched.length === 0) continue;
    out.push({
      name: group.name,
      section,
      matchedCategories: matched.slice(0, 12).map((c) => c.name),
      approxItems: matched.reduce((sum, c) => sum + (counts.get(c.id) ?? 0), 0),
    });
  }
  return out;
}
