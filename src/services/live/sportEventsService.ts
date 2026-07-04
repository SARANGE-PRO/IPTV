import * as catalogRepository from '@/db/repositories/catalogRepository';
import * as settingsRepository from '@/db/repositories/settingsRepository';
import { getFullChannelEpg } from '@/services/epg/epgService';
import { canonicalChannelKey } from '@/services/live/channelNormalizer';
import { classifySport, normSport, type SportKind } from '@/utils/sportClassify';
import type { EpgProgramme } from '@/types/epg';
import type { XtreamCredentials } from '@/types/xtream';

export type { SportKind };

/**
 * Evenements sportifs a venir pour l'accueil : scanne l'EPG (a la demande,
 * borne) de quelques chaines sport FR et remonte les prochains matchs foot et
 * combats MMA (France / PSG / UFC prioritaires), tries du plus proche au plus
 * lointain. Metadonnees uniquement (get_short_epg) : AUCUNE connexion flux
 * consommee (compte a token unique preserve). Resultat cache 30 min.
 */

export interface SportEvent {
  channelId: string;
  channelName: string;
  title: string;
  start: number;
  kind: SportKind;
  /** France / PSG / UFC — mis en avant. */
  priority: boolean;
  /** Tres gros evenement (finale, Ligue des champions, UFC, Grand Chelem...). */
  major: boolean;
}

// v2 : invalide l'ancien cache (logique de detection elargie).
const CACHE_KEY = 'homeSportEvents2';
const CACHE_TTL_MS = 30 * 60 * 1000;
const MAX_CHANNELS = 18;
const FR_POOL_CAP = 4000;
// 7 jours : l'EPG COMPLET (get_simple_data_table) couvre plusieurs jours.
const HORIZON_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_EVENTS = 30;

// Diffuseurs a scanner : chaines sport MAIS AUSSI grandes generalistes FR — les
// gros matchs (Coupe du Monde, Euro, France) passent sur TF1/M6/France 2, PAS
// sur des chaines de theme "sport". Ne plus se limiter au theme sport.
const BROADCASTER_HINTS = [
  // Sport
  'bein', 'rmc sport', 'canal+ sport', 'canal plus sport', 'canal sport', 'dazn',
  'l equipe', 'lequipe', 'eurosport', 'ligue 1', 'infosport', 'sport en france',
  'ares', 'ufc',
  // Grandes generalistes qui diffusent les gros evenements FR
  'tf1', 'm6', 'france 2', 'france 3', 'france 4', 'france tv', 'w9', 'c8', 'tmc', 'canal+',
];
// Prioritaires (scannees en premier) : les diffuseurs des plus gros matchs FR.
const STRONG_HINTS = [
  'tf1', 'm6', 'france 2', 'france 3', 'bein', 'rmc sport', 'canal+ sport',
  'canal plus sport', 'dazn', 'l equipe', 'lequipe',
];

interface CacheShape {
  at: number;
  events: SportEvent[];
}

export async function findUpcomingSportEvents(credentials: XtreamCredentials): Promise<SportEvent[]> {
  // Cle liee au compte : sinon un changement de serveur/utilisateur afficherait
  // jusqu'a 30 min les evenements de l'ancien compte.
  const cacheKey = `${CACHE_KEY}:${credentials.serverUrl}|${credentials.username}`;
  const cached = await settingsRepository.getSetting<CacheShape>(cacheKey);
  if (cached !== undefined && Date.now() - cached.at < CACHE_TTL_MS) {
    // Re-filtre a la lecture : un evenement deja commence ne doit plus etre
    // affiche comme "a venir" (le cache vit jusqu'a 30 min).
    const stillUpcoming = cached.events.filter((e) => e.start > Date.now());
    if (stillUpcoming.length > 0) return stillUpcoming;
  }

  // Pool FR complet (borne) — PAS seulement le theme "sport" : les gros matchs
  // FR passent sur les generalistes (TF1/M6/France 2).
  const pool = await catalogRepository.getLiveChannelsPage({ kind: 'french' }, 0, FR_POOL_CAP);
  const seenKey = new Set<string>();
  const candidates = pool
    .filter((c) => {
      const n = normSport(c.name);
      return BROADCASTER_HINTS.some((h) => n.includes(h));
    })
    // Dedup des variantes (TF1 HD / TF1 FHD / TF1 4K -> une seule) : inutile de
    // scanner 3x le meme EPG.
    .filter((c) => {
      const key = canonicalChannelKey(c.name);
      if (seenKey.has(key)) return false;
      seenKey.add(key);
      return true;
    })
    // Prioritaires (gros diffuseurs) d'abord — tri stable — avant le plafond.
    .map((c) => ({ c, strong: STRONG_HINTS.some((h) => normSport(c.name).includes(h)) }))
    .sort((a, b) => Number(b.strong) - Number(a.strong))
    .slice(0, MAX_CHANNELS)
    .map((x) => x.c);

  const now = Date.now();
  const seen = new Set<string>();
  const events: SportEvent[] = [];

  // EPG des chaines candidates en PARALLELE (au lieu de 8 aller-retours en serie).
  const epgByChannel = await Promise.all(
    candidates.map((channel) =>
      getFullChannelEpg(credentials, channel.id)
        .catch(() => [] as EpgProgramme[])
        .then((programmes) => ({ channel, programmes })),
    ),
  );

  for (const { channel, programmes } of epgByChannel) {
    for (const p of programmes) {
      if (p.start < now || p.start > now + HORIZON_MS) continue;
      const meta = classifySport(p.title);
      if (meta === null) continue;
      // Dedup : meme titre dans un creneau de 30 min (multi-chaines / doublons).
      const key = `${normSport(p.title)}@${Math.round(p.start / (30 * 60 * 1000))}`;
      if (seen.has(key)) continue;
      seen.add(key);
      events.push({
        channelId: channel.id,
        channelName: channel.name,
        title: p.title,
        start: p.start,
        ...meta,
      });
    }
  }

  events.sort((a, b) => a.start - b.start);
  const result = events.slice(0, MAX_EVENTS);
  await settingsRepository.setSetting<CacheShape>(cacheKey, { at: Date.now(), events: result });
  return result;
}
