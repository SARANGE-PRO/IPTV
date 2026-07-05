import type { FootballMatch, FootballTeam } from '@/app/api/football/route';
import * as catalogRepository from '@/db/repositories/catalogRepository';
import { getFullChannelEpg } from '@/services/epg/epgService';
import { detectQuality, sportChannelMatchKey } from '@/services/live/channelNormalizer';
import type { XtreamCredentials } from '@/types/xtream';
import { broadcastersFor } from '@/utils/footballBroadcasters';
import { epgMentionsMatch, teamNameForms } from '@/utils/footballMatch';

/** Acces client a la route /api/football (jamais d'appel direct a l'API foot). */

export async function loadFootballMatches(comps: string[]): Promise<FootballMatch[]> {
  if (comps.length === 0) return [];
  try {
    const res = await fetch(`/api/football?comps=${encodeURIComponent(comps.join(','))}`, { cache: 'no-store' });
    if (!res.ok) return [];
    const data = (await res.json()) as { matches?: FootballMatch[] };
    return Array.isArray(data.matches) ? data.matches : [];
  } catch {
    return [];
  }
}

export async function loadCompetitionTeams(code: string): Promise<FootballTeam[]> {
  try {
    const res = await fetch(`/api/football?teams=${encodeURIComponent(code)}`, { cache: 'no-store' });
    if (!res.ok) return [];
    const data = (await res.json()) as { teams?: FootballTeam[] };
    return Array.isArray(data.teams) ? data.teams : [];
  } catch {
    return [];
  }
}

export function isLiveStatus(status: string): boolean {
  return status === 'IN_PLAY' || status === 'PAUSED';
}

export function isFinishedStatus(status: string): boolean {
  return status === 'FINISHED' || status === 'AWARDED';
}

export interface BroadcastChannel {
  id: string;
  name: string;
}

/**
 * Resout les chaines FR candidates d'une competition (mapping diffuseurs) vers
 * les vraies chaines du bouquet Live de l'utilisateur (recherche Dexie + cle
 * canonique). Sert au « Voir le match » click-to-play.
 */
export async function resolveBroadcastChannels(competitionCode: string): Promise<BroadcastChannel[]> {
  const names = broadcastersFor(competitionCode);
  // Une entree par chaine (cle canonique) : on garde la MEILLEURE qualite, pas
  // toutes les variantes (FHD/HD/4K/backup) qui encombraient l'affichage. `order`
  // preserve l'ordre du mapping (probabilite decroissante des droits TV).
  const bestByKey = new Map<string, { id: string; name: string; score: number; order: number }>();
  let order = 0;
  for (const name of names) {
    const key = sportChannelMatchKey(name);
    // >= 2 : laisse passer M6 / W9 (cle a 2 caracteres) sans admettre le bruit
    // 1-caractere. Le rapprochement se fait par EGALITE stricte de cle canonique
    // (un `startsWith` faisait matcher beIN 1 avec beIN 10/11/12).
    if (key.length < 2) {
      order += 1;
      continue;
    }
    const candidates = await catalogRepository.searchLiveChannels(name, 25);
    for (const c of candidates) {
      if (sportChannelMatchKey(c.name) !== key) continue;
      const score = detectQuality(c.name).score;
      const existing = bestByKey.get(key);
      if (existing === undefined) {
        bestByKey.set(key, { id: c.id, name: c.name, score, order });
      } else if (score > existing.score) {
        bestByKey.set(key, { id: c.id, name: c.name, score, order: existing.order });
      }
    }
    order += 1;
    if (bestByKey.size >= 8) break;
  }
  return [...bestByKey.values()]
    .sort((a, b) => a.order - b.order)
    .map(({ id, name }) => ({ id, name }));
}

export interface MatchChannel {
  id: string;
  name: string;
  /** L'EPG de cette chaine mentionne CE match autour du coup d'envoi (chaine exacte). */
  confirmed: boolean;
}

/**
 * Chaine EXACTE d'un match (Alternative B) : croise les chaines candidates
 * (mapping diffuseurs) avec leur EPG autour du coup d'envoi. Une chaine est
 * « confirmee » si son programme mentionne les deux equipes (nom EN + trad FR).
 * Les confirmees remontent en tete. EPG = metadonnees (proxy), aucune connexion
 * de flux consommee (sur un compte max_connections:1).
 */
export async function resolveMatchChannels(
  credentials: XtreamCredentials,
  match: FootballMatch,
): Promise<MatchChannel[]> {
  const candidates = await resolveBroadcastChannels(match.competitionCode);
  if (candidates.length === 0) return [];
  const homeForms = teamNameForms(match.home);
  const awayForms = teamNameForms(match.away);
  const winStart = match.start - 25 * 60_000;
  const winEnd = match.start + 45 * 60_000;

  const out = await Promise.all(
    candidates.map(async (c) => {
      let confirmed = false;
      try {
        const epg = await getFullChannelEpg(credentials, c.id);
        confirmed = epg.some(
          (p) =>
            p.start <= winEnd &&
            p.end >= winStart &&
            epgMentionsMatch(`${p.title} ${p.description ?? ''}`, homeForms, awayForms),
        );
      } catch {
        confirmed = false;
      }
      return { id: c.id, name: c.name, confirmed };
    }),
  );
  out.sort((a, b) => Number(b.confirmed) - Number(a.confirmed));
  return out;
}
