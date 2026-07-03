import type { Category } from '@/types/models';

/**
 * Priorisation des categories : pays selectionne d'abord (FR par defaut),
 * puis FR, puis alphabetique. Les categories masquees (blacklist) sont
 * exclues ; les autres pays restent toujours listes.
 */
export function prioritizeCategories(
  categories: Category[],
  country: string,
  hidden: Set<string>,
): Category[] {
  const boost = (c: Category): number => {
    if (country === 'ALL') return 0;
    if (c.country === country) return 2;
    if (country === 'FR' && c.isFrench === 1) return 2;
    return 0;
  };
  return categories
    .filter((c) => !hidden.has(c.id))
    .sort((a, b) => boost(b) - boost(a) || b.isFrench - a.isFrench || a.name.localeCompare(b.name, 'fr'));
}
