/** Normalisation de texte partagee (recherche, detection, tokens). */

/** Minuscules, sans accents, espaces normalises. */
export function normalizeText(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Tokens alphanumeriques normalises d'un libelle. */
export function tokenizeLabel(input: string): string[] {
  return normalizeText(input)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0);
}

/** Stop-words FR/EN simples — exclus de l'index et des requetes. */
const STOP_WORDS = new Set([
  'le', 'la', 'les', 'un', 'une', 'des', 'de', 'du', 'et', 'en', 'au', 'aux', 'sur',
  'the', 'a', 'an', 'and', 'of', 'to', 'in', 'on', 'at',
  'el', 'los', 'las', 'il', 'lo',
]);

function significantTokens(input: string, max: number): string[] {
  const out: string[] = [];
  for (const token of tokenizeLabel(input)) {
    if (token.length < 2 || STOP_WORDS.has(token)) continue;
    if (!out.includes(token)) out.push(token);
    if (out.length >= max) break;
  }
  return out;
}

/** Tokens indexes d'un nom d'item (index multiEntry Dexie). */
export function buildSearchTokens(name: string): string[] {
  return significantTokens(name, 16);
}

/** Tokens d'une requete de recherche utilisateur. */
export function tokenizeQuery(query: string): string[] {
  return significantTokens(query, 5);
}
