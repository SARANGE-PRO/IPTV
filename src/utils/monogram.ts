import { tokenizeLabel } from '@/utils/text';

/** Initiales + couleur stable derivees d'un nom — pour les fallbacks premium. */

/** 1 a 2 initiales significatives (stop-words et tags courts ignores). */
export function initials(name: string): string {
  const tokens = tokenizeLabel(name).filter((t) => t.length > 1);
  if (tokens.length === 0) return name.trim().slice(0, 2).toUpperCase() || '?';
  if (tokens.length === 1) return tokens[0]!.slice(0, 2).toUpperCase();
  return (tokens[0]![0]! + tokens[1]![0]!).toUpperCase();
}

// Palette sombre premium (fond de monogramme).
const PALETTE = ['#3A3A42', '#3D2E4A', '#2E3A4A', '#4A342E', '#2E4A3A', '#4A2E3A', '#38304A', '#2E434A'];

export function colorFromString(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length]!;
}
