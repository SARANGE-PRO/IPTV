/**
 * Classification d'un titre de programme en evenement sportif. PUR (aucune API
 * navigateur) -> reutilisable cote client (scan EPG Xtream) ET serveur (route
 * /api/sport-events qui parse un XMLTV public).
 */
export type SportKind = 'foot' | 'mma' | 'sport';

export interface SportClass {
  kind: SportKind;
  /** France / PSG / UFC — mis en avant. */
  priority: boolean;
  /** Tres gros evenement (finale, Coupe du Monde, UFC, Grand Chelem...). */
  major: boolean;
}

export function normSport(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Competitions foot explicites (signal fort d'un VRAI match), SANS 'foot' seul.
const FOOT_COMPETITIONS = [
  'ligue 1', 'ligue 2', 'ligue des champions', 'champions league', 'uefa',
  'europa', 'coupe du monde', 'mondial', 'coupe de france', 'liga', 'premier league',
  'serie a', 'bundesliga', 'eredivisie', 'ligue europa', 'ligue des nations',
  'nations league', 'eliminatoire', 'qualif', 'barrage', 'amical', 'euro ',
  'championnat', 'football',
];
// Motif "Equipe A vs/-/– Equipe B" : marqueur d'une affiche (espaces requis
// autour du separateur pour ne pas matcher un mot compose type "Saint-Etienne").
const VERSUS_RE = /(?:\bvs\b|\bv\b)|(?:[\p{L}\p{N}]\s[-–—/]\s[\p{L}\p{N}])/u;
// Plateaux/emissions a EXCLURE (un tiret dans le titre faisait de faux "foot").
const TALK_SHOW_KEYWORDS = [
  'club', 'magazine', 'debrief', 'studio', 'multiplex', 'journal', 'edition',
  'late', 'talk', 'emission', 'chronique', 'plateau', 'avant-match', 'avant match',
  'apres-match', 'apres match', 'analyse', 'best of', 'resume', 'retro', 'zapping',
];
const MMA_KEYWORDS = [
  'ufc', 'mma', 'bellator', 'pfl', 'ksw', 'ares', 'cage warriors', 'oktagon',
  'hexagone', 'octogone', 'arts martiaux', 'combat libre',
];
const GENERIC_SPORT_KEYWORDS = [
  'tennis', 'roland garros', 'wimbledon', 'formule 1', 'grand prix', 'nba',
  'rugby', 'top 14', 'boxe', 'basket', 'handball', 'jeux olympiques',
  'cyclisme', 'tour de france', 'athletisme', 'natation', 'ski', 'motogp',
  'moto gp', 'nfl', 'baseball', 'hockey', 'olympique', 'volley',
];
const PRIORITY_KEYWORDS = ['france', 'psg', 'paris sg', 'paris saint', 'ufc'];
const MAJOR_KEYWORDS = [
  'finale', 'final', 'ligue des champions', 'champions league', 'ufc',
  'france', 'coupe du monde', 'mondial', 'world cup', 'euro ', 'ligue des nations',
  'roland garros', 'wimbledon', 'grand prix', 'jeux olympiques', 'grand chelem',
];

export function classifySport(title: string): SportClass | null {
  const t = normSport(title);
  const isTalkShow = TALK_SHOW_KEYWORDS.some((k) => t.includes(k));
  const isMma = MMA_KEYWORDS.some((k) => t.includes(k));
  const isFoot = !isTalkShow && (FOOT_COMPETITIONS.some((k) => t.includes(k)) || VERSUS_RE.test(t));
  const isSport = !isTalkShow && GENERIC_SPORT_KEYWORDS.some((k) => t.includes(k));
  if (!isMma && !isFoot && !isSport) return null;
  return {
    kind: isMma ? 'mma' : isFoot ? 'foot' : 'sport',
    priority: PRIORITY_KEYWORDS.some((k) => t.includes(k)),
    major: MAJOR_KEYWORDS.some((k) => t.includes(k)),
  };
}
