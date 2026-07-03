import * as catalogRepository from '@/db/repositories/catalogRepository';
import * as settingsRepository from '@/db/repositories/settingsRepository';
import { getChannelEpg } from '@/services/epg/epgService';
import type { XtreamCredentials } from '@/types/xtream';

/**
 * "Prochain match" pour l'accueil : scanne l'EPG (a la demande, borne) d'une
 * poignee de chaines foot FR et remonte le prochain match a venir, France et
 * PSG prioritaires. Uniquement des metadonnees (get_short_epg) : ne consomme
 * AUCUNE connexion flux (compte a token unique preserve). Resultat cache 30 min.
 */

export interface NextMatch {
  channelId: string;
  channelName: string;
  title: string;
  start: number;
  priority: boolean;
}

const CACHE_KEY = 'homeNextMatch';
const CACHE_TTL_MS = 30 * 60 * 1000;
const MAX_CHANNELS = 6;
const HORIZON_MS = 48 * 60 * 60 * 1000;

const FOOT_CHANNEL_HINTS = [
  'bein', 'rmc sport', 'canal+ sport', 'canal plus sport', 'canal sport',
  'l equipe', 'lequipe', 'ligue 1', 'dazn', 'football', 'foot',
];
const MATCH_KEYWORDS = [
  'france', 'psg', 'paris sg', 'paris saint', 'ligue 1', 'ligue des champions',
  'champions league', 'uefa', 'europa', 'football', 'foot', 'coupe',
  'olympique', 'marseille', 'lyon', ' vs ', ' - ',
];
const PRIORITY_KEYWORDS = ['france', 'psg', 'paris sg', 'paris saint'];

function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

interface CacheShape {
  at: number;
  match: NextMatch | null;
}

export async function findNextMatch(credentials: XtreamCredentials): Promise<NextMatch | null> {
  const cached = await settingsRepository.getSetting<CacheShape>(CACHE_KEY);
  if (cached !== undefined && Date.now() - cached.at < CACHE_TTL_MS) return cached.match;

  const pool = await catalogRepository.getLiveChannelsPage({ kind: 'frenchTheme', theme: 'sport' }, 0, 60);
  const candidates = pool
    .filter((c) => {
      const n = norm(c.name);
      return FOOT_CHANNEL_HINTS.some((h) => n.includes(h));
    })
    .slice(0, MAX_CHANNELS);

  const now = Date.now();
  let best: NextMatch | null = null;

  for (const channel of candidates) {
    let programmes;
    try {
      programmes = await getChannelEpg(credentials, channel.id);
    } catch {
      continue;
    }
    for (const p of programmes) {
      if (p.start < now || p.start > now + HORIZON_MS) continue;
      const t = norm(p.title);
      if (!MATCH_KEYWORDS.some((k) => t.includes(k))) continue;
      const priority = PRIORITY_KEYWORDS.some((k) => t.includes(k));
      const candidate: NextMatch = {
        channelId: channel.id,
        channelName: channel.name,
        title: p.title,
        start: p.start,
        priority,
      };
      if (best === null) best = candidate;
      else if (priority && !best.priority) best = candidate;
      else if (priority === best.priority && candidate.start < best.start) best = candidate;
    }
  }

  await settingsRepository.setSetting<CacheShape>(CACHE_KEY, { at: Date.now(), match: best });
  return best;
}
