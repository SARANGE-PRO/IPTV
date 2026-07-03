import type { LiveChannel } from '@/types/models';

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
