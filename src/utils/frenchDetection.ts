import { FRENCH_KEYWORDS } from '@/config/constants';
import type { BoolNum } from '@/types/models';
import { tokenizeLabel } from './text';

const FRENCH_TOKENS = new Set<string>(FRENCH_KEYWORDS);

/** Detection par tokens exacts : "FR | TNT" match, "AFRICA" ne match pas. */
export function isFrenchLabel(label: string): boolean {
  if (label.includes('\u{1F1EB}\u{1F1F7}')) return true; // drapeau 🇫🇷
  return tokenizeLabel(label).some((t) => FRENCH_TOKENS.has(t));
}

/** Priorite France : FR d'abord, puis tri alphabetique. Ne supprime rien. */
export function sortFrenchFirst<T extends { isFrench: BoolNum; name: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => b.isFrench - a.isFrench || a.name.localeCompare(b.name, 'fr'));
}
