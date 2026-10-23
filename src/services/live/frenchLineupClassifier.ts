import {
  canonicalChannelKey,
  cleanChannelDisplay,
  compactCanonicalKey,
  detectQuality,
  isSeparatorOrEvent,
} from '@/services/live/channelNormalizer';
import type { LiveLineupEntry, LiveSection } from '@/types/liveLineup';
import type { BoolNum } from '@/types/models';
import { detectChannelTheme, detectUhd, type ChannelTheme } from '@/utils/channelTheme';
import { matchFrenchChannel, type FrenchChannelMatch } from '@/utils/frenchChannelReference';
import { sectionOfTheme, sectionOrder } from '@/utils/liveSections';
import { tokenizeLabel } from '@/utils/text';

/**
 * Classement de la grille FR — logique PURE (aucun acces Dexie), testable en
 * Node. Entree : les flux `isFrench = 1` et le nom de leur categorie. Sortie :
 * une `LiveLineupEntry` par flux, les versions d'une meme chaine harmonisees
 * (meme section, meme theme, meme `sortKey` -> adjacentes a la lecture).
 *
 * Priorites de section : pays francophone etranger > referentiel >
 * categorie regionale > chaine 24/7 > theme detecte.
 */

export interface LineupSourceRow {
  id: string;
  name: string;
  categoryId: string;
  logoUrl: string | null;
}

/** Pays francophones hors France : mots longs n'importe ou dans le libelle. */
const COUNTRY_WORDS: Record<string, string> = {
  belgique: 'BE', belgium: 'BE', belge: 'BE', belges: 'BE',
  suisse: 'CH', swiss: 'CH', switzerland: 'CH', romande: 'CH',
  quebec: 'CA', canada: 'CA', canadien: 'CA', canadienne: 'CA', qc: 'CA',
  luxembourg: 'LU',
  afrique: 'AF', africa: 'AF', african: 'AF', africaine: 'AF', maghreb: 'AF',
  senegal: 'AF', ivoire: 'AF', cameroun: 'AF', congo: 'AF', haiti: 'AF',
};

/** Codes courts : seulement en TETE de libelle (« BE| La Une », « CA: TVA »). */
const COUNTRY_CODES: Record<string, string> = { be: 'BE', ch: 'CH', ca: 'CA', qc: 'CA', lu: 'LU', afr: 'AF' };

const REGIONAL_WORDS = new Set([
  'region', 'regions', 'regional', 'regionale', 'regionales', 'regionaux', 'locale', 'locales', 'local',
  'outre', 'dom', 'antilles', 'martinique', 'guadeloupe', 'guyane', 'reunion', 'caraibes', 'mayotte',
]);

const ADULT_WORDS = new Set([
  'xxx', 'adult', 'adults', 'adulte', 'adultes', 'porn', 'porno', 'dorcel', 'hustler', 'playboy',
  'penthouse', 'brazzers', 'redlight', 'vivid',
]);

const FOOTBALL_PATTERN =
  /\b(foot|football|ligue\s*1|ligue\s*des\s*champions|uefa|champions\s*league|europa|premier\s*league|la\s*liga|bundesliga|serie\s*a)\b/;

function originOf(name: string, categoryName: string): string {
  for (const label of [name, categoryName]) {
    const tokens = tokenizeLabel(label);
    // « FRANCE / BELGIQUE » : libelle mixte, on garde la France. Le simple
    // tag « FR| » (langue) ne compte pas : « FR| BELGIQUE » reste belge.
    if (tokens.includes('france')) continue;
    const head = tokens[0];
    if (head !== undefined && COUNTRY_CODES[head] !== undefined) return COUNTRY_CODES[head]!;
    for (const token of tokens) {
      const country = COUNTRY_WORDS[token];
      if (country !== undefined) return country;
    }
  }
  return 'FR';
}

function hasWord(label: string, words: Set<string>): boolean {
  return tokenizeLabel(label).some((token) => words.has(token));
}

function is247(label: string): boolean {
  return /\b24\s*\/\s*7\b|\b24\s*-\s*7\b|\bh24\b|\b247\b/i.test(label);
}

/** Exclus de la grille (restent dans « Tous » et la recherche). */
export function isExcludedFromLineup(name: string, categoryName: string): boolean {
  return isSeparatorOrEvent(name) || hasWord(name, ADULT_WORDS) || hasWord(categoryName, ADULT_WORDS);
}

interface ClassifiedRow {
  row: LineupSourceRow;
  origin: string;
  groupKey: string;
  country: string | null;
  ref: FrenchChannelMatch | null;
  theme: ChannelTheme;
  regional: boolean;
  h247: boolean;
  quality: ReturnType<typeof detectQuality>;
  isUhd: boolean;
}

/** Referentiel consulte une fois par nom distinct (une chaine = 4-8 flux). */
type RefCache = Map<string, FrenchChannelMatch | null>;

function cachedMatch(canonical: string, cache: RefCache): FrenchChannelMatch | null {
  const key = compactCanonicalKey(canonical);
  let match = cache.get(key);
  if (match === undefined) {
    match = matchFrenchChannel(key);
    cache.set(key, match);
  }
  return match;
}

function classifyRow(row: LineupSourceRow, categoryName: string, cache: RefCache): ClassifiedRow | null {
  if (isExcludedFromLineup(row.name, categoryName)) return null;
  const canonical = canonicalChannelKey(row.name);
  if (canonical === '') return null;
  const ref = cachedMatch(canonical, cache);
  const origin = originOf(row.name, categoryName);
  const country = origin !== 'FR' ? origin : (ref?.country ?? null);
  return {
    row,
    origin,
    // Hors France, la meme chaine (« BE| TF1 ») reste une entree distincte.
    groupKey: origin !== 'FR' ? `${origin.toLowerCase()}:${canonical}` : canonical,
    country,
    ref,
    theme: detectChannelTheme(row.name, categoryName),
    regional: hasWord(categoryName, REGIONAL_WORDS),
    h247: is247(row.name) || is247(categoryName),
    quality: detectQuality(row.name),
    isUhd: detectUhd(row.name, categoryName),
  };
}

/** Theme le plus frequent hors « general » (repli : general). */
function dominantTheme(rows: ClassifiedRow[]): ChannelTheme {
  const counts = new Map<ChannelTheme, number>();
  for (const r of rows) {
    if (r.theme !== 'general') counts.set(r.theme, (counts.get(r.theme) ?? 0) + 1);
  }
  let best: ChannelTheme = 'general';
  let bestCount = 0;
  for (const [theme, count] of counts) {
    if (count > bestCount) {
      best = theme;
      bestCount = count;
    }
  }
  return best;
}

const pad = (n: number, width: number) => String(Math.max(0, Math.min(n, 10 ** width - 1))).padStart(width, '0');

const SMALL_WORDS = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'et', 'en', 'au', 'aux', 'sur', 'a', 'l', 'd']);

/**
 * Nom fournisseur TOUT EN MAJUSCULES -> casse lisible, une fois au classement :
 * « FRANCE 3 ALSACE » -> « France 3 Alsace », « BFM PARIS » -> « BFM Paris ».
 * Sigles courts (BFM, TV7, RTL) gardes ; noms deja en casse mixte intacts.
 */
export function readableChannelName(name: string): string {
  if (/\p{Ll}/u.test(name) || !/\p{Lu}{2}/u.test(name)) return name;
  return name
    .split(/(\s+|[-/'’])/)
    .map((part, index) => {
      if (!/\p{Lu}/u.test(part)) return part;
      const lower = part.toLocaleLowerCase('fr');
      if (SMALL_WORDS.has(lower)) return index > 0 ? lower : lower.charAt(0).toLocaleUpperCase('fr') + lower.slice(1);
      // Sigles : 3 lettres max, ou lettres + chiffres (TV7, W9, RMC).
      if (part.length <= 3 || /\d/.test(part)) return part;
      return lower.charAt(0).toLocaleUpperCase('fr') + lower.slice(1);
    })
    .join('');
}

/** Cle de tri « naturelle » : Canal+ Live 2 avant Canal+ Live 10. */
function naturalKey(key: string): string {
  return key.replace(/\d+/g, (digits) => digits.padStart(4, '0'));
}

function sectionFor(group: ClassifiedRow[], ref: FrenchChannelMatch | null, theme: ChannelTheme): LiveSection {
  if (group[0]!.origin !== 'FR') return 'francophonie';
  if (ref !== null) return ref.section;
  if (group.some((r) => r.regional)) return 'regions';
  if (group.some((r) => r.h247)) return 'h247';
  return sectionOfTheme(theme);
}

/**
 * Construit la grille : classe chaque flux, regroupe par chaine logique,
 * harmonise section/theme/nom/rang par groupe puis emet une entree par flux.
 */
export function buildLineupEntries(
  rows: Iterable<LineupSourceRow>,
  categoryNameOf: (categoryId: string) => string,
): LiveLineupEntry[] {
  const groups = new Map<string, ClassifiedRow[]>();
  const cache: RefCache = new Map();
  for (const row of rows) {
    const classified = classifyRow(row, categoryNameOf(row.categoryId), cache);
    if (classified === null) continue;
    const bucket = groups.get(classified.groupKey);
    if (bucket === undefined) groups.set(classified.groupKey, [classified]);
    else bucket.push(classified);
  }

  const entries: LiveLineupEntry[] = [];
  for (const [groupKey, group] of groups) {
    group.sort((a, b) => b.quality.score - a.quality.score);
    const best = group[0]!;
    const ref = group.find((r) => r.ref !== null)?.ref ?? null;
    const theme = ref?.theme ?? dominantTheme(group);
    const section = sectionFor(group, ref, theme);
    const name = ref?.name ?? readableChannelName(cleanChannelDisplay(best.row.name) || best.row.name);
    const lcn = section === 'tnt' ? (ref?.lcn ?? null) : null;
    const rank = lcn ?? ref?.rank ?? 9999;
    const sortKey = `${pad(sectionOrder(section), 2)}${pad(rank, 4)}|${naturalKey(groupKey)}|${groupKey}`;
    const isFootball: BoolNum =
      (ref?.foot ?? false) || FOOTBALL_PATTERN.test(groupKey.replace(/^[a-z]{2}:/, '')) ? 1 : 0;

    for (const r of group) {
      entries.push({
        id: r.row.id,
        groupKey,
        sortKey,
        section,
        theme,
        lcn,
        name,
        country: best.country,
        isFootball,
        rawName: r.row.name,
        categoryId: r.row.categoryId,
        logoUrl: r.row.logoUrl,
        quality: r.quality.quality,
        qualityLabel: r.quality.label,
        qualityScore: r.quality.score,
        isUhd: r.isUhd ? 1 : 0,
      });
    }
  }
  return entries;
}
