import { cleanChannelDisplay, sportChannelMatchKey } from '@/services/live/channelNormalizer';
import { normalizeText } from '@/utils/text';

/**
 * Chaines TV FRANCAISES qui diffusent du football (brique pure, client +
 * serveur) :
 *  - liste blanche des chaines du guide XMLTV a analyser (nationales sport et
 *    generalistes — jamais les regionales/locales qui produisaient des faux
 *    positifs : France 3 Paris, TV locales, OLTV…) ;
 *  - cle de rapprochement guide <-> bouquet Xtream (« Canal+ Live 7 » ==
 *    « FR| CANAL+ LIVE 7 FHD » == « C+ LIVE 7 ») ;
 *  - familles de chaines a numero d'evenement (Canal+ Live N, beIN MAX N,
 *    Ligue 1+ N…) : leur numero change a chaque match, jamais « probable ».
 */

/** Identifiants xmltvfr.fr retenus (suffixe .fr, nationaux). */
const GUIDE_CHANNEL_RE =
  /^(beINSPORTS(\d+|MAX\d+)|CanalPlus|CanalPlusFoot|CanalPlusSport|CanalPlusSport360|CanalPlusLive\d+|CanalPlusPremierLeague|CanalPlusLigue1|CanalPlusUHD|Ligue1Plus\d*|DAZN\d*|RMCSport\d+|RMCSportUHD|LEquipe\d*|LEquipeLive\d+|LEquipeLiveFoot|Eurosport[12]|Eurosport360\d+|InfosportPlus|TF1|TF14k|M6|France2|France3|France4|W9|TMC|TFX|6ter|Gulli|SportEnFrance|EvenementsSports4KUHD)\.fr$/;

export function isFootballGuideChannel(guideId: string): boolean {
  return GUIDE_CHANNEL_RE.test(guideId);
}

/** Nom d'affichage harmonise d'une chaine du guide. */
export function guideChannelDisplay(guideId: string, displayName: string): string {
  if (guideId === 'CanalPlusLigue1.fr') return 'Canal+ Ligue 1';
  if (guideId === 'LEquipe21.fr' || guideId === 'LEquipe.fr') return "L'Équipe";
  const rmc = /^RMCSport(\d+)\.fr$/.exec(guideId);
  if (rmc !== null) return `RMC Sport ${rmc[1]}`;
  if (guideId === 'DAZN.fr') return 'DAZN 1';
  return displayName.replace(/\s+/g, ' ').trim();
}

/** Familles a numero d'evenement (le numero varie d'un match a l'autre). */
const NUMBERED_FAMILY = /^(canal\+ live|bein sports max|ligue 1\+ \d|eurosport 360|l'equipe live|rmc sport live|evenements sports)/i;

export function isEventChannel(display: string): boolean {
  return NUMBERED_FAMILY.test(normalizeText(display).replace(/\s+/g, ' '));
}

/** Chaines gratuites (TNT) : mises en avant quand elles diffusent. */
const FREE_TO_AIR = new Set(['tf1', 'france2', 'france3', 'france4', 'm6', 'w9', 'tmc', 'tfx', '6ter', 'lachainelequipe', 'gulli']);

// Alias apres compaction (cle sportChannelMatchKey) : sigles et variantes de
// nommage des fournisseurs IPTV.
const KEY_ALIASES: Record<string, string> = {
  dazn: 'dazn1',
  ligue1plus1: 'ligue1plus',
  l1plus: 'ligue1plus',
  bein: 'beinsport1',
  rmcsport: 'rmcsport1',
  canalplussport1: 'canalplussport',
  canalplusfr: 'canalplus',
  canalplusfrance: 'canalplus',
  m6hd: 'm6',
  tf1hd: 'tf1',
  france2hd: 'france2',
  eurosport: 'eurosport1',
};

/**
 * Cle de rapprochement d'une chaine TV FR (guide ou bouquet IPTV). S'appuie sur
 * la cle sport existante (prefixe pays/qualite retires, « sports »→« sport »)
 * puis normalise les sigles : « C+ » -> canal plus, « L1+ » -> ligue 1 plus,
 * « RMC Sport Live 3 » -> rmcsport3, suffixes pays (FR, France) retires.
 */
export function tvChannelKey(name: string): string {
  const cleaned = cleanChannelDisplay(name)
    .replace(/\b(?:fr|france|french|vf)\s*$/i, '')
    .replace(/^\s*(?:fr|france)\s*[:|-]?\s+/i, '')
    .replace(/\bC\s*\+/gi, 'Canal+')
    .replace(/\bL1\s*\+/gi, 'Ligue 1+');
  let key = sportChannelMatchKey(cleaned);
  key = key.replace(/^rmcsportlive(\d+)$/, 'rmcsport$1').replace(/^lequipelivefoot$/, 'lequipelivefoot');
  return KEY_ALIASES[key] ?? key;
}

export function isFreeToAir(display: string): boolean {
  return FREE_TO_AIR.has(tvChannelKey(display));
}
