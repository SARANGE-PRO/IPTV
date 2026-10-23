import * as catalogRepository from '@/db/repositories/catalogRepository';
import { apiUrl } from '@/services/apiBase';
import { getFullChannelEpg } from '@/services/epg/epgService';
import type { FavoriteTeam, FootballFeed, FootballMatch, FootballTeam, MatchSide, TvBroadcast } from '@/types/football';
import type { XtreamCredentials } from '@/types/xtream';
import { epgMentionsMatch, teamForms } from '@/utils/footballMatch';
import { normalizeText } from '@/utils/text';
import { findBouquetChannels, type ChannelRef } from './channelIndex';

/**
 * Acces client au football : flux /api/football (matchs + diffusions FR) et
 * resolution des diffusions vers les chaines JOUABLES du bouquet Xtream.
 */

export async function loadFootballFeed(comps: string[]): Promise<FootballFeed | null> {
  if (comps.length === 0) return { matches: [], guide: 'ready', guideAt: null, failed: [] };
  try {
    const res = await fetch(apiUrl(`/api/football?comps=${encodeURIComponent(comps.join(','))}`), { cache: 'no-store' });
    if (!res.ok) return null;
    const data = (await res.json()) as Partial<FootballFeed>;
    return {
      matches: Array.isArray(data.matches) ? data.matches : [],
      guide: data.guide ?? 'unavailable',
      guideAt: data.guideAt ?? null,
      failed: Array.isArray(data.failed) ? data.failed : [],
    };
  } catch {
    return null;
  }
}

export async function loadCompetitionTeams(code: string): Promise<FootballTeam[]> {
  try {
    const res = await fetch(apiUrl(`/api/football?teams=${encodeURIComponent(code)}`), { cache: 'no-store' });
    if (!res.ok) return [];
    const data = (await res.json()) as { teams?: FootballTeam[] };
    return Array.isArray(data.teams) ? data.teams : [];
  } catch {
    return [];
  }
}

export function isLive(m: FootballMatch): boolean {
  return m.state === 'live' || m.state === 'halftime';
}

export function isFinished(m: FootballMatch): boolean {
  return m.state === 'finished';
}

export function isUpcoming(m: FootballMatch): boolean {
  return m.state === 'scheduled';
}

/** Equipe favorite : par identifiant, sinon par nom (anciens favoris migres). */
export function isFavoriteSide(side: MatchSide, favorites: FavoriteTeam[]): boolean {
  if (favorites.length === 0) return false;
  const names = [normalizeText(side.name), normalizeText(side.short)];
  return favorites.some((f) => f.id === side.id || names.includes(normalizeText(f.name)));
}

export function involvesFavorite(m: FootballMatch, favorites: FavoriteTeam[]): boolean {
  return isFavoriteSide(m.home, favorites) || isFavoriteSide(m.away, favorites);
}

// --- Diffusions -> chaines jouables ----------------------------------------------

export interface ResolvedBroadcast {
  broadcast: TvBroadcast;
  /** Chaine du bouquet, null si absente du bouquet. */
  channel: ChannelRef | null;
  /** Source de la certitude : guide TV FR, ou EPG du serveur Xtream. */
  confirmedBy: 'guide' | 'xtream' | null;
}

export interface MatchWatchOptions {
  /** Diffusions officielles (guide / probables), resolues vers le bouquet. */
  broadcasts: ResolvedBroadcast[];
  /** Flux « evenement » du bouquet dont le NOM cite les deux equipes. */
  eventChannels: ChannelRef[];
}

/** Flux evenementiels du fournisseur nommes d'apres le match (« PSG vs Lyon 21:00 »). */
async function findEventChannels(match: FootballMatch): Promise<ChannelRef[]> {
  const home = teamForms(match.home);
  const away = teamForms(match.away);
  const token = [...home.tokens].sort((a, b) => b.length - a.length)[0];
  if (token === undefined) return [];
  const rows = await catalogRepository.searchLiveChannels(token, 40);
  return rows
    .filter((c) => epgMentionsMatch(c.name, home, away))
    .slice(0, 4)
    .map((c) => ({ id: c.id, name: c.name }));
}

/**
 * Ou regarder un match : diffusions du flux resolues vers le bouquet. Si rien
 * n'est confirme par le guide, l'EPG du serveur Xtream des chaines probables
 * est interroge (metadonnees uniquement, aucune connexion de flux).
 */
export async function resolveWatchOptions(
  match: FootballMatch,
  credentials: XtreamCredentials | null,
): Promise<MatchWatchOptions> {
  const channels = await findBouquetChannels(match.tv.map((b) => b.channel));
  const broadcasts: ResolvedBroadcast[] = match.tv.map((broadcast, i) => ({
    broadcast,
    channel: channels[i] ?? null,
    confirmedBy: broadcast.confidence === 'confirmed' ? 'guide' : null,
  }));

  const needsEpg = credentials !== null && !broadcasts.some((b) => b.confirmedBy !== null) && match.state !== 'finished';
  if (needsEpg) {
    const home = teamForms(match.home);
    const away = teamForms(match.away);
    const winStart = match.start - 30 * 60_000;
    const winEnd = match.start + 45 * 60_000;
    await Promise.all(
      broadcasts.map(async (b) => {
        if (b.channel === null) return;
        try {
          const epg = await getFullChannelEpg(credentials, b.channel.id);
          const hit = epg.some(
            (p) => p.start <= winEnd && p.end >= winStart && epgMentionsMatch(`${p.title} ${p.description ?? ''}`, home, away),
          );
          if (hit) b.confirmedBy = 'xtream';
        } catch {
          // EPG indisponible : la diffusion reste « probable ».
        }
      }),
    );
  }

  // Jouables d'abord, puis certitude, puis ordre serveur.
  const order = (b: ResolvedBroadcast): number =>
    (b.channel !== null ? 100 : 0) + (b.confirmedBy !== null ? 10 : 0) + (b.broadcast.kind === 'match' ? 1 : 0);
  broadcasts.sort((a, b) => order(b) - order(a));

  const eventChannels = (await findEventChannels(match).catch(() => [])).filter(
    (e) => !broadcasts.some((b) => b.channel?.id === e.id),
  );
  return { broadcasts, eventChannels };
}

/** Chaines du bouquet pour une liste de matchs (pastilles « dans ton bouquet »). */
export async function bouquetAvailability(matches: FootballMatch[]): Promise<Map<string, ChannelRef | null>> {
  const names = [...new Set(matches.flatMap((m) => m.tv.map((b) => b.channel)))];
  const resolved = await findBouquetChannels(names);
  return new Map(names.map((n, i) => [n, resolved[i] ?? null]));
}
