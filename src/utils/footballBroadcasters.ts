/**
 * Diffuseurs FR par competition (Alternative A : football-data.org ne renvoie
 * PAS la chaine TV). Mapping en dur des droits TV France, ordonne par
 * probabilite. Sert a proposer un « Voir le match » qui ouvre la bonne chaine du
 * bouquet Live (resolution par recherche dans le catalogue Xtream).
 *
 * NB : approximatif au niveau competition (pas « beIN 1 vs beIN 2 » pour un match
 * precis, impossible sans EPG) -> on propose les chaines candidates plausibles.
 */

const BROADCASTERS: Record<string, string[]> = {
  WC: ['TF1', 'M6', 'beIN Sports 1', 'beIN Sports 2', 'beIN Sports 3'], // Coupe du Monde 2026 (TF1/M6 en clair + beIN)
  EC: ['TF1', 'M6', 'beIN Sports 1', 'beIN Sports 2'], // Euro
  CL: ['Canal+ Foot', 'Canal+ Sport', 'beIN Sports 1'], // Ligue des Champions
  FL1: ['Ligue 1+', 'DAZN', 'beIN Sports 1'], // Ligue 1
  PL: ['Canal+ Foot', 'Canal+ Sport'], // Premier League
  PD: ['beIN Sports 1', 'beIN Sports 2', 'beIN Sports 3'], // Liga
  SA: ['beIN Sports 1', 'beIN Sports 2'], // Serie A
  BL1: ['beIN Sports 1', 'beIN Sports 2'], // Bundesliga
  PPL: ['beIN Sports 1'], // Primeira Liga
  DED: ['beIN Sports 1'], // Eredivisie
  ELC: ['beIN Sports 1'], // Championship
  BSA: ['beIN Sports 1'], // Brasileirao
};

/** Chaines FR candidates pour une competition (code football-data). */
export function broadcastersFor(competitionCode: string): string[] {
  return BROADCASTERS[competitionCode] ?? ['beIN Sports 1'];
}
