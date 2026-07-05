import { normalizeText } from '@/utils/text';

/**
 * Rapprochement equipe football-data <-> programme EPG. football-data renvoie les
 * noms en ANGLAIS ("England", "Germany") alors que l'EPG FR dit "Angleterre",
 * "Allemagne". On genere donc plusieurs FORMES normalisees par equipe (nom
 * anglais + traduction FR pour les nations + nom court) pour matcher un titre EPG.
 */

/** Nations : nom anglais (football-data) -> nom francais (EPG). */
const NATION_FR: Record<string, string> = {
  germany: 'allemagne', spain: 'espagne', england: 'angleterre', netherlands: 'pays-bas',
  belgium: 'belgique', croatia: 'croatie', switzerland: 'suisse', denmark: 'danemark',
  poland: 'pologne', sweden: 'suede', austria: 'autriche', ukraine: 'ukraine',
  'czech republic': 'republique tcheque', 'united states': 'etats-unis', mexico: 'mexique',
  brazil: 'bresil', argentina: 'argentine', uruguay: 'uruguay', colombia: 'colombie',
  'south korea': 'coree du sud', 'korea republic': 'coree du sud', japan: 'japon',
  'saudi arabia': 'arabie saoudite', morocco: 'maroc', senegal: 'senegal', ghana: 'ghana',
  cameroon: 'cameroun', tunisia: 'tunisie', nigeria: 'nigeria', egypt: 'egypte',
  algeria: 'algerie', "ivory coast": 'cote d ivoire', 'south africa': 'afrique du sud',
  canada: 'canada', 'costa rica': 'costa rica', ecuador: 'equateur', peru: 'perou',
  chile: 'chili', paraguay: 'paraguay', iran: 'iran', qatar: 'qatar', australia: 'australie',
  'new zealand': 'nouvelle-zelande', portugal: 'portugal', italy: 'italie', france: 'france',
  greece: 'grece', turkey: 'turquie', scotland: 'ecosse', 'republic of ireland': 'irlande',
  ireland: 'irlande', norway: 'norvege', romania: 'roumanie', hungary: 'hongrie',
  slovakia: 'slovaquie', slovenia: 'slovenie', 'north macedonia': 'macedoine du nord',
  albania: 'albanie', georgia: 'georgie', serbia: 'serbie', wales: 'pays de galles',
  panama: 'panama', honduras: 'honduras', jamaica: 'jamaique', 'cape verde': 'cap-vert',
};

interface TeamLike {
  name: string;
  short: string;
}

/** Formes normalisees d'une equipe (nom anglais + trad FR nation + nom court). */
export function teamNameForms(team: TeamLike): string[] {
  const forms = new Set<string>();
  const add = (s: string) => {
    const n = normalizeText(s).replace(/\b(fc|cf|sc|ac|as|club|football)\b/g, '').replace(/\s+/g, ' ').trim();
    if (n.length >= 3) forms.add(n);
  };
  add(team.name);
  add(team.short);
  const key = normalizeText(team.name);
  if (NATION_FR[key] !== undefined) add(NATION_FR[key]);
  return [...forms];
}

/** Vrai si le titre/description EPG mentionne les DEUX equipes du match. */
export function epgMentionsMatch(text: string, homeForms: string[], awayForms: string[]): boolean {
  const hay = normalizeText(text);
  const homeHit = homeForms.some((f) => hay.includes(f));
  const awayHit = awayForms.some((f) => hay.includes(f));
  return homeHit && awayHit;
}
