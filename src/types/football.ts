/**
 * Contrat de la route /api/football, PARTAGE client/serveur. Vit ici (et non
 * dans la route) : les composants/services ne doivent jamais importer depuis
 * app/api (sens des dependances), et la coquille statique construit l'app
 * sans ce dossier (scripts/build-static.mjs).
 */

export type MatchState = 'scheduled' | 'live' | 'halftime' | 'finished' | 'postponed' | 'canceled';

export interface MatchSide {
  /** Identifiant fournisseur (ESPN, sinon football-data prefixe `fd:`). */
  id: string;
  name: string;
  short: string;
  abbr: string;
  logo: string | null;
  score: number | null;
  /** Tirs au but. */
  shootout: number | null;
  winner: boolean | null;
}

/**
 * Diffusion TV en France.
 *  - `confirmed` : le guide TV FR montre CE match sur cette chaine a l'heure
 *    du coup d'envoi (chaine exacte).
 *  - `probable`  : droits de la competition (observes dans le guide, sinon
 *    table 2026-27) — la chaine precise n'est pas garantie.
 */
export type BroadcastConfidence = 'confirmed' | 'probable';

export interface TvBroadcast {
  /** Nom d'affichage (« Canal+ Foot », « beIN SPORTS MAX 4 », « Ligue 1+ 3 »). */
  channel: string;
  confidence: BroadcastConfidence;
  /** `multiplex` : la chaine diffuse un multiplex qui inclut ce match. */
  kind: 'match' | 'multiplex';
}

export interface FootballMatch {
  id: string;
  /** Coup d'envoi (epoch ms). */
  start: number;
  state: MatchState;
  /** « 67' », « 45'+2' », « MT », « TAB », « a.p. »… ou null. */
  clock: string | null;
  competition: { code: string; name: string; short: string; logo: string | null };
  /** « Ligue Europa - 3e journée », « Phase de ligue »… */
  round: string | null;
  venue: string | null;
  home: MatchSide;
  away: MatchSide;
  /** Diffusions FR, la plus sure d'abord. Vide = aucune diffusion trouvee. */
  tv: TvBroadcast[];
}

export type GuideStatus = 'ready' | 'loading' | 'unavailable';

export interface FootballFeed {
  matches: FootballMatch[];
  /** Etat du guide TV FR (chaines exactes). */
  guide: GuideStatus;
  /** Date de generation du guide utilise (ms), si disponible. */
  guideAt: number | null;
  /** Competitions dont les matchs n'ont pas pu etre charges. */
  failed: string[];
}

/** Equipe favorite (reglages). Anciens favoris football-data : id `fd:<n>`. */
export interface FavoriteTeam {
  id: string;
  name: string;
}

export interface FootballTeam {
  id: string;
  name: string;
  short: string;
  logo: string | null;
}
