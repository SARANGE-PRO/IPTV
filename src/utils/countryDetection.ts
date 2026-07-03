import { tokenizeLabel } from './text';

/** Detection pays/langue par tokens de libelles IPTV. Pragmatique, extensible. */

const COUNTRY_BY_TOKEN: Record<string, string> = {
  fr: 'FR', france: 'FR', francais: 'FR', french: 'FR',
  belgique: 'BE', belgium: 'BE',
  suisse: 'CH', swiss: 'CH', switzerland: 'CH',
  quebec: 'CA', canada: 'CA',
  uk: 'GB', england: 'GB', british: 'GB',
  us: 'US', usa: 'US',
  espagne: 'ES', espana: 'ES', spain: 'ES', spanish: 'ES', espanol: 'ES',
  allemagne: 'DE', germany: 'DE', german: 'DE', deutsch: 'DE', deutschland: 'DE',
  italie: 'IT', italia: 'IT', italy: 'IT', italian: 'IT', italiano: 'IT',
  turquie: 'TR', turkey: 'TR', turkish: 'TR', turk: 'TR',
  portugal: 'PT', portugues: 'PT', portuguese: 'PT',
  bresil: 'BR', brasil: 'BR', brazil: 'BR',
  nederland: 'NL', netherlands: 'NL', dutch: 'NL', hollande: 'NL',
  pologne: 'PL', polska: 'PL', poland: 'PL', polish: 'PL',
  russie: 'RU', russia: 'RU', russian: 'RU',
  inde: 'IN', india: 'IN', indian: 'IN', hindi: 'IN',
  pakistan: 'PK',
  maroc: 'MA', morocco: 'MA',
  algerie: 'DZ', algeria: 'DZ',
  tunisie: 'TN', tunisia: 'TN',
  roumanie: 'RO', romania: 'RO', romanian: 'RO',
  albanie: 'AL', albania: 'AL', shqip: 'AL',
  grece: 'GR', greece: 'GR', greek: 'GR',
};

const LANGUAGE_BY_TOKEN: Record<string, string> = {
  vf: 'fr', vff: 'fr', vfq: 'fr', vostfr: 'fr', truefrench: 'fr',
  french: 'fr', francais: 'fr', francophone: 'fr',
  english: 'en',
  arabic: 'ar', arabe: 'ar', arab: 'ar',
  espanol: 'es', latino: 'es', spanish: 'es',
  german: 'de', deutsch: 'de',
  italian: 'it', italiano: 'it',
  turkish: 'tr',
  portuguese: 'pt', portugues: 'pt',
  polish: 'pl', polski: 'pl',
  russian: 'ru',
  hindi: 'hi',
};

const LANGUAGE_BY_COUNTRY: Record<string, string> = {
  FR: 'fr', GB: 'en', US: 'en', ES: 'es', DE: 'de', IT: 'it', TR: 'tr',
  PT: 'pt', BR: 'pt', NL: 'nl', PL: 'pl', RU: 'ru', IN: 'hi',
  MA: 'ar', DZ: 'ar', TN: 'ar', RO: 'ro', AL: 'sq', GR: 'el', PK: 'ur',
};

export function detectCountry(label: string): string | null {
  for (const token of tokenizeLabel(label)) {
    const country = COUNTRY_BY_TOKEN[token];
    if (country !== undefined) return country;
  }
  return null;
}

export function detectLanguage(label: string): string | null {
  for (const token of tokenizeLabel(label)) {
    const language = LANGUAGE_BY_TOKEN[token];
    if (language !== undefined) return language;
  }
  const country = detectCountry(label);
  return country !== null ? (LANGUAGE_BY_COUNTRY[country] ?? null) : null;
}
