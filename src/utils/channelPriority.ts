import type { LiveChannel } from '@/types/models';
import type { ChannelTheme } from '@/utils/channelTheme';

/**
 * Priorite souple des chaines FR majeures : normalisation deja calculee lors
 * de la sync, regex bornees et score. Les variantes HD/FHD/4K restent donc
 * reconnues sans dependre d'un libelle fournisseur exact.
 */
const PRIORITY_PATTERNS: RegExp[] = [
  /^tf1(?:\s|$)/,
  /^france\s*2(?:\s|$)/,
  /^france\s*3(?:\s|$)/,
  /^france\s*4(?:\s|$)/,
  /^france\s*5(?:\s|$)/,
  /^m6(?:\s|$)/,
  /^arte(?:\s|$)/,
  /^canal(?:\s|\+|plus|$)/,
  /^c8(?:\s|$)/,
  /^w9(?:\s|$)/,
  /^tmc(?:\s|$)/,
  /^tfx(?:\s|$)/,
  /^nrj\s*12(?:\s|$)/,
  /^lcp(?:\s|$)/,
  /^bfm\s*tv(?:\s|$)/,
  /^cnews(?:\s|$)/,
  /^lci(?:\s|$)/,
  /^france\s*info(?:\s|$)/,
  /^rmc(?:\s|$)/,
  /^bein\s*sport(?:\s|$)/,
  /^eurosport(?:\s|$)/,
  /^gulli(?:\s|$)/,
  /^disney\s*channel(?:\s|$)/,
  /^nickelodeon(?:\s|$)/,
  /^national\s*geographic(?:\s|$)/,
  /^discovery(?:\s|$)/,
  /^planete(?:\s|$)/,
];

export function mainFrenchChannelScore(channel: Pick<LiveChannel, 'normalizedName' | 'isFrench'>): number {
  if (channel.isFrench !== 1) return 0;
  const index = PRIORITY_PATTERNS.findIndex((pattern) => pattern.test(channel.normalizedName));
  return index === -1 ? 0 : PRIORITY_PATTERNS.length - index;
}

/** Vrai si la chaine fait partie des grandes chaines FR (TNT / principales). */
export function isMainFrenchChannel(channel: Pick<LiveChannel, 'normalizedName' | 'isFrench'>): boolean {
  return mainFrenchChannelScore(channel) > 0;
}

const FOOTBALL_PATTERN =
  /\b(foot|football|ligue\s*1|ligue\s*des\s*champions|uefa|champions|europa|coupe|premier\s*league|la\s*liga|bundesliga|serie\s*a|mls|caf|can)\b/;

/** Vrai si la chaine est orientee football (sous-ensemble du theme sport). */
export function isFootballChannel(channel: Pick<LiveChannel, 'normalizedName'>): boolean {
  return FOOTBALL_PATTERN.test(channel.normalizedName);
}

/** Ordre de regroupement thematique pour le tri Live (apres les principales). */
const THEME_RANK: Record<ChannelTheme, number> = {
  sport: 0,
  news: 1,
  cinema: 2,
  entertainment: 3,
  kids: 4,
  doc: 5,
  music: 6,
  general: 7,
};

/**
 * Comparateur de tri Live "intelligent" (ordre naturel type app TV) :
 * 1) grandes chaines FR (TF1, France 2, M6, Canal+, beIN…) dans l'ordre canonique ;
 * 2) chaines FR restantes regroupees par theme (sport, news, cinema, divertissement,
 *    enfants, doc, musique, general) ;
 * 3) chaines non-FR ensuite ;
 * 4) a egalite, ordre fournisseur (sortOrder).
 */
export function compareLiveChannels(a: LiveChannel, b: LiveChannel): number {
  return (
    mainFrenchChannelScore(b) - mainFrenchChannelScore(a) ||
    b.isFrench - a.isFrench ||
    THEME_RANK[a.theme] - THEME_RANK[b.theme] ||
    a.sortOrder - b.sortOrder
  );
}
