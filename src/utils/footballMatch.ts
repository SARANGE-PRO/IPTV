import { normalizeText } from '@/utils/text';

/**
 * RAPPROCHEMENT equipe (source des matchs, noms ANGLAIS) <-> programme TV FR
 * (noms FRANCAIS : « Juventus Turin », « Etoile Rouge de Belgrade », « La
 * Gantoise », « Paris-SG »). Brique PURE (client + serveur, testee en Node).
 *
 * Score d'un cote : 1.0 si une forme complete de l'equipe apparait (mots
 * entiers), sinon somme des tokens distinctifs trouves (0.8, tokens generiques
 * 0.4 : real, atletico, sporting, inter…), plafonnee a 1. Un « token » peut
 * matcher par prefixe de 6 lettres (bergamo/bergame, copenhagen/copenhague).
 */

/** Nations : nom anglais -> nom francais. */
export const NATION_FR: Record<string, string> = {
  germany: 'Allemagne', spain: 'Espagne', england: 'Angleterre', netherlands: 'Pays-Bas',
  belgium: 'Belgique', croatia: 'Croatie', switzerland: 'Suisse', denmark: 'Danemark',
  poland: 'Pologne', sweden: 'Suède', austria: 'Autriche', ukraine: 'Ukraine',
  'czech republic': 'Tchéquie', czechia: 'Tchéquie', 'united states': 'États-Unis', usa: 'États-Unis',
  mexico: 'Mexique', brazil: 'Brésil', argentina: 'Argentine', uruguay: 'Uruguay', colombia: 'Colombie',
  'south korea': 'Corée du Sud', 'korea republic': 'Corée du Sud', japan: 'Japon',
  'saudi arabia': 'Arabie saoudite', morocco: 'Maroc', senegal: 'Sénégal', ghana: 'Ghana',
  cameroon: 'Cameroun', tunisia: 'Tunisie', nigeria: 'Nigeria', egypt: 'Égypte',
  algeria: 'Algérie', 'ivory coast': "Côte d'Ivoire", "cote d'ivoire": "Côte d'Ivoire", 'south africa': 'Afrique du Sud',
  canada: 'Canada', 'costa rica': 'Costa Rica', ecuador: 'Équateur', peru: 'Pérou',
  chile: 'Chili', paraguay: 'Paraguay', iran: 'Iran', qatar: 'Qatar', australia: 'Australie',
  'new zealand': 'Nouvelle-Zélande', portugal: 'Portugal', italy: 'Italie', france: 'France',
  greece: 'Grèce', turkey: 'Turquie', turkiye: 'Turquie', scotland: 'Écosse', 'republic of ireland': 'Irlande',
  ireland: 'Irlande', 'northern ireland': 'Irlande du Nord', norway: 'Norvège', romania: 'Roumanie', hungary: 'Hongrie',
  slovakia: 'Slovaquie', slovenia: 'Slovénie', 'north macedonia': 'Macédoine du Nord',
  albania: 'Albanie', georgia: 'Géorgie', serbia: 'Serbie', wales: 'Pays de Galles',
  panama: 'Panama', honduras: 'Honduras', jamaica: 'Jamaïque', 'cape verde': 'Cap-Vert', 'cape verde islands': 'Cap-Vert',
  finland: 'Finlande', iceland: 'Islande', israel: 'Israël', luxembourg: 'Luxembourg', cyprus: 'Chypre',
  'bosnia and herzegovina': 'Bosnie-Herzégovine', montenegro: 'Monténégro', kosovo: 'Kosovo', armenia: 'Arménie',
  azerbaijan: 'Azerbaïdjan', kazakhstan: 'Kazakhstan', lithuania: 'Lituanie', latvia: 'Lettonie', estonia: 'Estonie',
  belarus: 'Biélorussie', moldova: 'Moldavie', malta: 'Malte', bulgaria: 'Bulgarie', 'faroe islands': 'Îles Féroé',
  gibraltar: 'Gibraltar', andorra: 'Andorre', 'san marino': 'Saint-Marin', liechtenstein: 'Liechtenstein',
};

/** Equipes : forme normalisee (anglaise) -> formes FR additionnelles. */
const TEAM_ALIASES: Record<string, string[]> = {
  'paris saint germain': ['paris sg', 'psg', 'paris saint germain'],
  'olympique marseille': ['marseille', 'om'],
  'olympique lyonnais': ['lyon', 'ol'],
  'bayern munich': ['bayern munich', 'bayern'],
  'internazionale': ['inter milan', 'inter'],
  'inter milan': ['inter milan', 'inter'],
  'napoli': ['naples'],
  'roma': ['as rome', 'roma'],
  'as roma': ['as rome', 'roma'],
  'juventus': ['juventus turin', 'juventus'],
  'sporting cp': ['sporting portugal', 'sporting lisbonne', 'sporting cp'],
  'nec nijmegen': ['nimegue'],
  'nijmegen': ['nimegue'],
  'kaa gent': ['la gantoise', 'gand'],
  'gent': ['la gantoise', 'gand'],
  'red star belgrade': ['etoile rouge'],
  'crvena zvezda': ['etoile rouge'],
  'fc copenhagen': ['copenhague'],
  'red bull salzburg': ['salzbourg'],
  'salzburg': ['salzbourg'],
  'sc freiburg': ['fribourg'],
  'freiburg': ['fribourg'],
  'eintracht frankfurt': ['francfort'],
  'mainz': ['mayence'],
  'fc cologne': ['cologne'],
  'koln': ['cologne'],
  'borussia monchengladbach': ['monchengladbach', 'gladbach'],
  'athletic club': ['athletic bilbao', 'bilbao'],
  'sevilla': ['seville', 'fc seville'],
  'real betis': ['betis'],
  'celta vigo': ['celta vigo', 'celta'],
  'deportivo la coruna': ['la corogne'],
  'club brugge': ['bruges', 'fc bruges'],
  'cercle brugge ksv': ['cercle bruges'],
  'standard liege': ['standard de liege', 'standard'],
  'royal antwerp': ['antwerp', 'anvers'],
  'antwerp': ['anvers'],
  'union st gilloise': ['union saint gilloise'],
  'psv eindhoven': ['psv'],
  'feyenoord rotterdam': ['feyenoord'],
  'galatasaray': ['galatasaray'],
  'fenerbahce': ['fenerbahce'],
  'besiktas': ['besiktas'],
  'shakhtar donetsk': ['chakhtar donetsk', 'chakhtar'],
  'dynamo kyiv': ['dynamo kiev'],
  'slavia prague': ['slavia prague'],
  'sparta prague': ['sparta prague'],
  'legia warsaw': ['legia varsovie'],
  'olympiacos': ['olympiakos'],
  'panathinaikos': ['panathinaikos'],
  'paok salonika': ['paok salonique', 'paok'],
  'aek athens': ['aek athenes'],
  'apoel nicosia': ['apoel nicosie'],
  'omonia nicosia': ['omonia nicosie'],
  'ferencvaros': ['ferencvaros'],
  'tottenham hotspur': ['tottenham'],
  'wolverhampton wanderers': ['wolverhampton', 'wolves'],
  'brighton hove albion': ['brighton'],
  'west ham united': ['west ham'],
  'manchester city': ['manchester city', 'man city'],
  'manchester united': ['manchester united', 'man united'],
  'newcastle united': ['newcastle'],
  'nottingham forest': ['nottingham forest', 'nottingham'],
  'saint etienne': ['saint etienne', 'asse'],
  'as monaco': ['monaco'],
  'stade rennais': ['rennes'],
  'stade brestois': ['brest'],
  'rc lens': ['lens'],
  'lille osc': ['lille', 'losc'],
  'ogc nice': ['nice'],
  'rc strasbourg': ['strasbourg'],
  'fc nantes': ['nantes'],
  'le havre ac': ['le havre'],
  'aj auxerre': ['auxerre'],
};

/** Mots non distinctifs (ignores comme token). */
const STOP = new Set([
  'fc', 'cf', 'sc', 'ac', 'as', 'ss', 'us', 'ud', 'cd', 'rc', 'rcd', 'sd', 'ca', 'cs', 'fk', 'sk', 'nk', 'bk', 'if', 'afc',
  'ksv', 'kv', 'kaa', 'krc', 'vfb', 'vfl', 'tsg', 'sv', 'ogc', 'osc', 'aj', 'sco', 'esp', 'club', 'de', 'la', 'le', 'les',
  'du', 'des', 'of', 'the', 'and', 'et', 'football', 'calcio', 'clube', 'futebol', 'stade', 'city', 'united', 'town',
  'county', 'rovers', 'wanderers', 'hotspur', 'albion', 'saint', 'st', 'san', 'sport', 'sports', 'olympique', '1', '2',
  '04', '05', '1899', '1909', '1846', '93',
]);

/** Tokens distinctifs mais AMBIGUS (plusieurs clubs) : poids reduit. */
const WEAK = new Set([
  'real', 'atletico', 'sporting', 'inter', 'dynamo', 'dinamo', 'racing', 'union', 'red', 'bull', 'athletic', 'paris',
  'manchester', 'madrid', 'milan', 'rome', 'roma', 'lisbonne', 'glasgow', 'prague', 'belgrade', 'nicosie', 'athenes',
  'borussia', 'eintracht', 'bayer', 'werder', 'young', 'boys', 'royal', 'standard',
]);

export interface TeamLike {
  name: string;
  short?: string;
  abbr?: string;
}

export interface TeamForms {
  /** Formes completes normalisees (mots entiers). */
  phrases: string[];
  /** Tokens distinctifs (>= 3 lettres, hors STOP). */
  tokens: string[];
}

function norm(s: string): string {
  return normalizeText(s).replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Nom francais d'une nation (affichage), sinon le nom d'origine. */
export function frenchTeamName(name: string): string {
  return NATION_FR[normalizeText(name)] ?? name;
}

export function teamForms(team: TeamLike): TeamForms {
  const base = [team.name, team.short ?? '']
    .map(norm)
    .filter((s) => s.length >= 2);
  const phrases = new Set<string>();
  for (const b of base) {
    phrases.add(b);
    const nation = NATION_FR[b];
    if (nation !== undefined) phrases.add(norm(nation));
    for (const [key, forms] of Object.entries(TEAM_ALIASES)) {
      if (b === key || b.includes(key)) for (const f of forms) phrases.add(norm(f));
    }
  }
  const tokens = new Set<string>();
  for (const p of phrases) {
    for (const t of p.split(' ')) if (t.length >= 3 && !STOP.has(t)) tokens.add(t);
  }
  return {
    phrases: [...phrases].filter((p) => p.length >= 3 || /^(om|ol)$/.test(p)),
    tokens: [...tokens],
  };
}

function containsPhrase(text: string, phrase: string): boolean {
  return ` ${text} `.includes(` ${phrase} `);
}

/** Score d'un cote d'affiche (texte deja normalise) pour une equipe. */
export function sideScore(forms: TeamForms, text: string): number {
  if (text === '') return 0;
  if (forms.phrases.some((p) => containsPhrase(text, p))) return 1;
  const words = text.split(' ');
  let score = 0;
  for (const t of forms.tokens) {
    const hit = words.some((w) => w === t || (t.length >= 6 && w.length >= 6 && w.slice(0, 6) === t.slice(0, 6)));
    if (hit) score += WEAK.has(t) ? 0.4 : 0.8;
  }
  return Math.min(1, score);
}

export interface Affiche {
  a: string;
  b: string;
}

/**
 * Extrait l'affiche « A / B » d'un programme (titre ou sous-titre). Les guides
 * FR utilisent « / » pour les rencontres (« Hoffenheim / Lyon », sous-titre
 * « Paris-SG / Lyon » des titres « Football : Ligue 1 ») et « - » pour les
 * plateaux. Renvoie les deux cotes normalises, sinon null.
 */
export function parseAffiche(title: string, subtitle: string | null): Affiche | null {
  for (const text of [title, subtitle ?? '']) {
    const idx = text.indexOf(' / ');
    if (idx <= 0) continue;
    // « Ligue 1 : Paris-SG / Lyon » -> on retire le prefixe avant « : ».
    const left = text.slice(0, idx).replace(/^.*:\s*/, '');
    const right = text.slice(idx + 3).replace(/\s*[(|].*$/, '');
    const a = norm(left);
    const b = norm(right);
    if (a !== '' && b !== '') return { a, b };
  }
  return null;
}

/**
 * Score d'un programme pour un match (0 = sans rapport, 2 = les deux equipes
 * exactes). Ordre domicile/exterieur prefere, l'inverse accepte (x0.9).
 */
export function afficheScore(home: TeamForms, away: TeamForms, affiche: Affiche): number {
  const direct = sideScore(home, affiche.a) + sideScore(away, affiche.b);
  const swapped = (sideScore(home, affiche.b) + sideScore(away, affiche.a)) * 0.9;
  return Math.max(direct, swapped);
}

/** Seuil d'acceptation : une equipe exacte, ou deux equipes partiellement reconnues. */
export const AFFICHE_MIN_SCORE = 1.0;

/**
 * Confirmation par l'EPG du serveur Xtream (texte libre) : vrai si les DEUX
 * equipes sont mentionnees (titre + description).
 */
export function epgMentionsMatch(text: string, home: TeamForms, away: TeamForms): boolean {
  const affiche = parseAffiche(text, null);
  if (affiche !== null && afficheScore(home, away, affiche) >= 1.6) return true;
  const hay = norm(text);
  return sideScore(home, hay) >= 0.8 && sideScore(away, hay) >= 0.8;
}
