/**
 * Catalogue des competitions de football suivies (refonte foot).
 *
 * `code` = identifiant de ligue ESPN (source des matchs/scores, sans cle).
 * `guideNames` = libelles utilises par les guides TV FR (xmltvfr.fr) pour
 * rattacher un MULTIPLEX a sa competition. `seedChannels` = diffuseurs FR
 * 2026-27 (verifies : Canal+ coupes d'Europe & Premier League, Ligue 1+ pour
 * la Ligue 1, DAZN Liga/Serie A, beIN Bundesliga/Ligue 2) — REPLI uniquement,
 * toujours affiche « probable » : la chaine exacte vient du guide TV, et les
 * droits observes dans le guide priment sur cette table.
 * `legacy` = ancien code football-data.org (migration des reglages).
 */

export type CompetitionGroup = 'europe' | 'league' | 'cup' | 'nations';

export interface CompetitionDef {
  code: string;
  name: string;
  short: string;
  group: CompetitionGroup;
  country?: string;
  /** Importance (tri des rangees / header). */
  rank: number;
  /** Suivie par defaut. */
  default: boolean;
  guideNames: string[];
  seedChannels: string[];
  /** Les diffuseurs « seed » ne valent que pour les matchs de l'equipe de France. */
  seedFranceOnly?: boolean;
  legacy?: string;
  /** Code football-data.org (secours si ESPN indisponible et cle configuree). */
  fdCode?: string;
}

export const FOOTBALL_COMPETITIONS: CompetitionDef[] = [
  // --- Coupes d'Europe / mondiales (clubs) ---
  { code: 'uefa.champions', name: 'Ligue des champions', short: 'LdC', group: 'europe', rank: 100, default: true, guideNames: ['ligue des champions', 'champions league'], seedChannels: ['Canal+ Foot', 'Canal+'], legacy: 'CL', fdCode: 'CL' },
  { code: 'uefa.europa', name: 'Ligue Europa', short: 'Europa', group: 'europe', rank: 90, default: true, guideNames: ['ligue europa', 'europa league'], seedChannels: ['Canal+ Foot', 'Canal+ Sport'] },
  { code: 'uefa.europa.conf', name: 'Ligue Conférence', short: 'Conférence', group: 'europe', rank: 80, default: true, guideNames: ['ligue conference', 'conference league'], seedChannels: ['Canal+ Foot', 'Canal+ Sport'] },
  { code: 'uefa.super_cup', name: "Supercoupe d'Europe", short: 'Supercoupe', group: 'europe', rank: 85, default: true, guideNames: ['supercoupe d europe', 'super cup'], seedChannels: ['Canal+'] },
  { code: 'fifa.cwc', name: 'Coupe du monde des clubs', short: 'Mondial clubs', group: 'europe', rank: 70, default: true, guideNames: ['coupe du monde des clubs'], seedChannels: [] },
  // --- Championnats ---
  { code: 'fra.1', name: 'Ligue 1', short: 'Ligue 1', group: 'league', country: 'France', rank: 95, default: true, guideNames: ['ligue 1'], seedChannels: ['Ligue 1+'], legacy: 'FL1', fdCode: 'FL1' },
  { code: 'eng.1', name: 'Premier League', short: 'PL', group: 'league', country: 'Angleterre', rank: 88, default: true, guideNames: ['premier league'], seedChannels: ['Canal+ Foot', 'Canal+ Premier League'], legacy: 'PL', fdCode: 'PL' },
  { code: 'esp.1', name: 'Liga', short: 'Liga', group: 'league', country: 'Espagne', rank: 86, default: true, guideNames: ['liga '], seedChannels: ['DAZN 1'], legacy: 'PD', fdCode: 'PD' },
  { code: 'ita.1', name: 'Serie A', short: 'Serie A', group: 'league', country: 'Italie', rank: 84, default: true, guideNames: ['serie a'], seedChannels: ['DAZN 1'], legacy: 'SA', fdCode: 'SA' },
  { code: 'ger.1', name: 'Bundesliga', short: 'Bundesliga', group: 'league', country: 'Allemagne', rank: 83, default: true, guideNames: ['bundesliga'], seedChannels: ['beIN SPORTS 1'], legacy: 'BL1', fdCode: 'BL1' },
  { code: 'fra.2', name: 'Ligue 2', short: 'Ligue 2', group: 'league', country: 'France', rank: 60, default: false, guideNames: ['ligue 2'], seedChannels: ['beIN SPORTS 1'] },
  { code: 'por.1', name: 'Liga Portugal', short: 'Portugal', group: 'league', country: 'Portugal', rank: 55, default: false, guideNames: ['liga portugal', 'primeira liga'], seedChannels: [], legacy: 'PPL', fdCode: 'PPL' },
  { code: 'ned.1', name: 'Eredivisie', short: 'Eredivisie', group: 'league', country: 'Pays-Bas', rank: 50, default: false, guideNames: ['eredivisie'], seedChannels: [], legacy: 'DED', fdCode: 'DED' },
  { code: 'tur.1', name: 'Süper Lig', short: 'Süper Lig', group: 'league', country: 'Turquie', rank: 45, default: false, guideNames: ['super lig'], seedChannels: [] },
  { code: 'bel.1', name: 'Pro League', short: 'Belgique', group: 'league', country: 'Belgique', rank: 42, default: false, guideNames: ['pro league', 'jupiler'], seedChannels: [] },
  { code: 'eng.2', name: 'Championship', short: 'Championship', group: 'league', country: 'Angleterre', rank: 40, default: false, guideNames: ['championship'], seedChannels: [], legacy: 'ELC', fdCode: 'ELC' },
  { code: 'sco.1', name: 'Premiership', short: 'Écosse', group: 'league', country: 'Écosse', rank: 35, default: false, guideNames: ['premiership'], seedChannels: [] },
  { code: 'usa.1', name: 'MLS', short: 'MLS', group: 'league', country: 'États-Unis', rank: 30, default: false, guideNames: ['mls'], seedChannels: [] },
  { code: 'bra.1', name: 'Brasileirão', short: 'Brésil', group: 'league', country: 'Brésil', rank: 30, default: false, guideNames: ['brasileirao'], seedChannels: [], legacy: 'BSA', fdCode: 'BSA' },
  // --- Coupes nationales ---
  { code: 'fra.coupe_de_france', name: 'Coupe de France', short: 'CdF', group: 'cup', country: 'France', rank: 75, default: true, guideNames: ['coupe de france'], seedChannels: ['France 2', 'beIN SPORTS 1'] },
  { code: 'fra.super_cup', name: 'Trophée des champions', short: 'TdC', group: 'cup', country: 'France', rank: 72, default: true, guideNames: ['trophee des champions'], seedChannels: [] },
  { code: 'esp.copa_del_rey', name: 'Coupe du Roi', short: 'Copa', group: 'cup', country: 'Espagne', rank: 45, default: false, guideNames: ['coupe du roi', 'copa del rey'], seedChannels: [] },
  { code: 'eng.fa', name: 'FA Cup', short: 'FA Cup', group: 'cup', country: 'Angleterre', rank: 44, default: false, guideNames: ['fa cup', 'coupe d angleterre'], seedChannels: [] },
  { code: 'ita.coppa_italia', name: "Coupe d'Italie", short: 'Coppa', group: 'cup', country: 'Italie', rank: 40, default: false, guideNames: ['coupe d italie', 'coppa italia'], seedChannels: [] },
  { code: 'ger.dfb_pokal', name: "Coupe d'Allemagne", short: 'Pokal', group: 'cup', country: 'Allemagne', rank: 40, default: false, guideNames: ['coupe d allemagne', 'dfb pokal'], seedChannels: [] },
  { code: 'eng.league_cup', name: 'Carabao Cup', short: 'Carabao', group: 'cup', country: 'Angleterre', rank: 35, default: false, guideNames: ['carabao', 'coupe de la ligue anglaise'], seedChannels: [] },
  // --- Selections ---
  { code: 'fifa.world', name: 'Coupe du monde', short: 'CdM', group: 'nations', rank: 100, default: true, guideNames: ['coupe du monde'], seedChannels: ['M6', 'beIN SPORTS 1'], legacy: 'WC', fdCode: 'WC' },
  { code: 'uefa.euro', name: 'Euro', short: 'Euro', group: 'nations', rank: 98, default: true, guideNames: ['euro '], seedChannels: ['TF1', 'M6'], legacy: 'EC', fdCode: 'EC' },
  { code: 'uefa.nations', name: 'Ligue des nations', short: 'LdN', group: 'nations', rank: 78, default: true, guideNames: ['ligue des nations', 'nations league'], seedChannels: ['TF1'], seedFranceOnly: true },
  { code: 'fifa.worldq.uefa', name: 'Qualifs Coupe du monde', short: 'Qualifs CdM', group: 'nations', rank: 76, default: true, guideNames: ['qualifications', 'eliminatoires'], seedChannels: ['TF1'], seedFranceOnly: true },
  { code: 'uefa.euroq', name: 'Qualifs Euro', short: 'Qualifs Euro', group: 'nations', rank: 74, default: true, guideNames: ['qualifications', 'eliminatoires'], seedChannels: ['TF1'], seedFranceOnly: true },
  { code: 'fifa.friendly', name: 'Matchs amicaux', short: 'Amicaux', group: 'nations', rank: 40, default: false, guideNames: ['match amical'], seedChannels: ['TF1'], seedFranceOnly: true },
];

export const COMPETITION_BY_CODE = new Map(FOOTBALL_COMPETITIONS.map((c) => [c.code, c]));

export const DEFAULT_COMPETITION_CODES = FOOTBALL_COMPETITIONS.filter((c) => c.default).map((c) => c.code);

/** Ancien code football-data -> code ESPN (migration des reglages). */
export const LEGACY_COMPETITION_CODES = new Map(
  FOOTBALL_COMPETITIONS.filter((c) => c.legacy !== undefined).map((c) => [c.legacy as string, c.code]),
);

export const COMPETITION_GROUP_LABEL: Record<CompetitionGroup, string> = {
  europe: "Coupes d'Europe",
  league: 'Championnats',
  cup: 'Coupes nationales',
  nations: 'Sélections',
};

export function competitionRank(code: string): number {
  return COMPETITION_BY_CODE.get(code)?.rank ?? 0;
}
