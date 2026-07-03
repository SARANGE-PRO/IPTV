import { CHANNEL_THEME_KEYWORDS, UHD_KEYWORDS } from '@/config/constants';
import { normalizeText } from '@/utils/text';

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

/** Classe une chaine par theme (nom chaine + nom categorie). Premier match gagne. */
export function detectChannelTheme(channelName: string, categoryName: string): ChannelTheme {
  const haystack = ` ${normalizeText(`${channelName} ${categoryName}`)} `;
  for (const theme of THEME_ORDER) {
    const keywords = CHANNEL_THEME_KEYWORDS[theme] ?? [];
    if (keywords.some((k) => haystack.includes(` ${normalizeText(k)} `) || haystack.includes(normalizeText(k)))) {
      return theme;
    }
  }
  return 'general';
}

export function detectUhd(channelName: string, categoryName: string): boolean {
  const haystack = normalizeText(`${channelName} ${categoryName}`);
  return UHD_KEYWORDS.some((k) => haystack.includes(normalizeText(k)));
}
