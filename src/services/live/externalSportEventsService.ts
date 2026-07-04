import * as catalogRepository from '@/db/repositories/catalogRepository';
import { sportChannelMatchKey } from '@/services/live/channelNormalizer';
import { findUpcomingSportEvents, type SportEvent } from '@/services/live/sportEventsService';
import type { SportKind } from '@/utils/sportClassify';
import type { XtreamCredentials } from '@/types/xtream';

/**
 * Source EXTERNE d'evenements sportifs (route /api/sport-events, XMLTV public) +
 * MAPPING vers les chaines Xtream de l'utilisateur (le point dur) : le guide
 * donne "beIN Sports 1", il faut retrouver TA chaine pour que "Regarder" lise le
 * flux. On rapproche via la cle canonique (TF1 HD/FHD -> "tf1"). Repli complet
 * sur le scan EPG Xtream in-app si la source externe est absente/vide/non mappee.
 */

interface RouteEvent {
  title: string;
  channel: string;
  start: number;
  kind: SportKind;
  priority: boolean;
  major: boolean;
}
const FR_POOL_CAP = 4000;

async function fetchExternal(): Promise<RouteEvent[]> {
  try {
    const res = await fetch('/api/sport-events', { cache: 'no-store' });
    if (!res.ok) return [];
    const data = (await res.json()) as { ok?: boolean; events?: RouteEvent[] };
    return Array.isArray(data.events) ? data.events : [];
  } catch {
    return [];
  }
}

/** Rapproche chaque evenement externe d'une chaine Xtream (cle canonique). Les
 *  evenements non mappables (chaine absente du catalogue) sont ecartes : sans
 *  chaine jouable, le bouton "Regarder" n'aurait aucun sens. */
async function mapToXtreamChannels(events: RouteEvent[]): Promise<SportEvent[]> {
  if (events.length === 0) return [];
  const pool = await catalogRepository.getLiveChannelsPage({ kind: 'french' }, 0, FR_POOL_CAP);
  const byKey = new Map<string, { id: string; name: string }>();
  for (const c of pool) {
    const key = sportChannelMatchKey(c.name);
    if (!byKey.has(key)) byKey.set(key, { id: c.id, name: c.name });
  }

  const mapped: SportEvent[] = [];
  for (const ev of events) {
    const match = byKey.get(sportChannelMatchKey(ev.channel));
    if (match === undefined) continue;
    mapped.push({
      channelId: match.id,
      channelName: match.name,
      title: ev.title,
      start: ev.start,
      kind: ev.kind,
      priority: ev.priority,
      major: ev.major,
    });
  }
  return mapped;
}

/**
 * Evenements sport pour l'accueil : source EXTERNE d'abord (si configuree et
 * mappable), sinon repli sur le scan EPG Xtream in-app. Toujours re-filtre les
 * evenements deja commences.
 */
export async function loadHomeSportEvents(credentials: XtreamCredentials): Promise<SportEvent[]> {
  const external = await mapToXtreamChannels(await fetchExternal());
  const now = Date.now();
  const upcoming = external.filter((e) => e.start > now).sort((a, b) => a.start - b.start);
  if (upcoming.length > 0) return upcoming;
  return findUpcomingSportEvents(credentials);
}
