import { db } from '@/db/database';
import type { HiddenCategoryEntry, Section } from '@/types/models';

/**
 * Blacklist de categories — masquage durable mais toujours REACTIVABLE depuis
 * les reglages. Le libelle est conserve pour afficher la liste de
 * reactivation sans jointure avec le catalogue.
 */

export async function hideCategory(
  section: Section,
  categoryId: string,
  label: string,
): Promise<void> {
  await db.hidden_categories.put({ section, categoryId, label, hiddenAt: Date.now() });
}

export async function unhideCategory(section: Section, categoryId: string): Promise<void> {
  await db.hidden_categories.delete([section, categoryId]);
}

export function getHiddenCategories(section: Section): Promise<HiddenCategoryEntry[]> {
  return db.hidden_categories.where('section').equals(section).toArray();
}

export function getAllHiddenCategories(): Promise<HiddenCategoryEntry[]> {
  return db.hidden_categories.toArray();
}

/** Ids masques d'une section — pour filtrer les vues en O(1). */
export async function getHiddenIdSet(section: Section): Promise<Set<string>> {
  const rows = await getHiddenCategories(section);
  return new Set(rows.map((r) => r.categoryId));
}

export async function isCategoryHidden(section: Section, categoryId: string): Promise<boolean> {
  return (await db.hidden_categories.get([section, categoryId])) !== undefined;
}

export async function clearHiddenCategories(): Promise<void> {
  await db.hidden_categories.clear();
}
