/**
 * Contrat de la route /api/football, PARTAGE client/serveur. Vit ici (et non
 * dans la route) : les composants/services ne doivent jamais importer depuis
 * app/api (sens des dependances), et la coquille statique construit l'app
 * sans ce dossier (scripts/build-static.mjs).
 */
export interface FootballMatch {
  id: number;
  start: number; // epoch ms
  status: string; // SCHEDULED | TIMED | IN_PLAY | PAUSED | FINISHED | ...
  minute: number | null;
  stage: string | null;
  matchday: number | null;
  venue: string | null;
  referee: string | null;
  halfTime: { home: number | null; away: number | null } | null;
  competition: string;
  competitionCode: string;
  home: { id: number | null; name: string; short: string; crest: string | null; goals: number | null };
  away: { id: number | null; name: string; short: string; crest: string | null; goals: number | null };
}

export interface FootballTeam {
  id: number;
  name: string;
  short: string;
  crest: string | null;
}
