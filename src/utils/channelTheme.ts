import { CHANNEL_THEME_KEYWORDS, UHD_KEYWORDS } from '@/config/constants';
import { tokenizeLabel } from '@/utils/text';

/** Themes de chaines pour les filtres rapides Live. */
export type ChannelTheme =
  | 'sport'
  | 'news'
  | 'kids'
  | 'cinema'
  | 'music'
  | 'doc'
  | 'entertainment'
  | 'general';

const THEME_ORDER: ChannelTheme[] = ['sport', 'news', 'kids', 'cinema', 'music', 'doc', 'entertainment'];

/**
 * Libelle -> mots entiers separes par des espaces, encadres (« ␣canal plus sport␣ »).
 * NFKD : les decorations ⁴ᴷ / ᵁᴴᴰ redeviennent « 4K » / « UHD ». « + » devient
 * « plus » (Canal+, Cine+, Planete+) au lieu de disparaitre.
 */
function wordsOf(label: string): string {
  return ` ${tokenizeLabel(label.normalize('NFKD').replace(/\+/g, ' plus ')).join(' ')} `;
}

/** Mots-cles precompiles au meme format (mots entiers, jamais de sous-chaine :
 *  « f1 » ne doit plus matcher « tf1 », ni « ocs » matcher « docs »). */
const THEME_PHRASES: Record<string, string[]> = Object.fromEntries(
  Object.entries(CHANNEL_THEME_KEYWORDS).map(([theme, keywords]) => [theme, keywords.map(wordsOf)]),
);

const UHD_PHRASES = UHD_KEYWORDS.map(wordsOf);

function themeOf(label: string): ChannelTheme | null {
  if (label.trim() === '') return null;
  const words = wordsOf(label);
  for (const theme of THEME_ORDER) {
    if ((THEME_PHRASES[theme] ?? []).some((phrase) => words.includes(phrase))) return theme;
  }
  return null;
}

/**
 * Classe une chaine par theme : le NOM d'abord, la categorie en repli (une
 * categorie « FR | SPORTS » ne fait plus basculer TF1 dans le sport si son nom
 * est explicite ailleurs). Premier theme trouve dans THEME_ORDER gagne.
 */
export function detectChannelTheme(channelName: string, categoryName: string): ChannelTheme {
  return themeOf(channelName) ?? themeOf(categoryName) ?? 'general';
}

export function detectUhd(channelName: string, categoryName: string): boolean {
  const words = wordsOf(`${channelName} ${categoryName}`);
  return UHD_PHRASES.some((phrase) => words.includes(phrase));
}
