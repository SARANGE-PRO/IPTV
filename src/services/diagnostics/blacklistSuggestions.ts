import { DEFAULT_BLACKLIST_HINTS } from '@/config/constants';
import type { BlacklistSuggestion, SectionStats } from '@/types';
import { tokenizeLabel } from '@/utils/text';

/** Suggestions de blacklist initiale — rien n'est masque sans accord utilisateur. */

const ADULT_TOKENS = new Set(['adult', 'adultes', 'adulte', 'xxx', 'porn', 'porno', '18']);

const HINT_TOKENS = new Set(
  DEFAULT_BLACKLIST_HINTS.map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, '')),
);

export function suggestBlacklist(sections: SectionStats[]): BlacklistSuggestion[] {
  const suggestions: BlacklistSuggestion[] = [];
  for (const section of sections) {
    for (const category of section.categories) {
      if (category.isFrench) continue;
      const tokens = new Set(tokenizeLabel(category.label));

      if ([...ADULT_TOKENS].some((t) => tokens.has(t))) {
        suggestions.push({
          categoryLabel: category.label,
          section: section.section,
          reason: 'adult',
          confidence: 0.95,
        });
        continue;
      }
      if ([...HINT_TOKENS].some((t) => tokens.has(t))) {
        suggestions.push({
          categoryLabel: category.label,
          section: section.section,
          reason: 'foreign-language',
          confidence: 0.75,
        });
        continue;
      }
      if (category.detectedCountry !== null && category.detectedCountry !== 'FR') {
        suggestions.push({
          categoryLabel: category.label,
          section: section.section,
          reason: 'non-french',
          confidence: 0.55,
        });
      }
    }
  }
  return suggestions.sort((a, b) => b.confidence - a.confidence);
}
