import * as catalogRepository from '@/db/repositories/catalogRepository';
import * as settingsRepository from '@/db/repositories/settingsRepository';
import { getFullChannelEpg } from '@/services/epg/epgService';
import { canonicalChannelKey } from '@/services/live/channelNormalizer';
import type { EpgProgramme } from '@/types/epg';
import type { XtreamCredentials } from '@/types/xtream';

/**
 * Evenements sportifs a venir pour l'accueil : scanne l'EPG (a la demande,
 * borne) de quelques chaines sport FR et remonte les prochains matchs foot et
 * combats MMA (France / PSG / UFC prioritaires), tries du plus proche au plus
 * lointain. Metadonnees uniquement (get_short_epg) : AUCUNE connexion flux
 * consommee (compte a token unique preserve). Resultat cache 30 min.
 */

export type SportKind = 'foot' | 'mma' | 'sport';

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

// Competitions foot explicites (signal fort d'un VRAI match). Volontairement
// SANS 'foot'/'football' seuls : trop faibles (matchent les plateaux/talk-shows
// "Late Football Club", "Late Foot"...).
const FOOT_COMPETITIONS = [
  'ligue 1', 'ligue 2', 'ligue des champions', 'champions league', 'uefa',
  'europa', 'coupe du monde', 'mondial', 'coupe de france', 'liga', 'premier league',
  'serie a', 'bundesliga', 'eredivisie', 'ligue europa', 'ligue des nations',
  'nations league', 'eliminatoire', 'qualif', 'barrage', 'amical', 'euro ',
  'championnat', 'football',
];
// Motif "Equipe A vs/-/– Equipe B" : le vrai marqueur d'une affiche. Le mot
// "vs"/"v" ou un separateur entoure d'espaces avec du texte de part et d'autre.
const VERSUS_RE = /(?:\bvs\b|\bv\b)|(?:[\p{L}\p{N}]\s[-–—/]\s[\p{L}\p{N}])/u;
// Emissions/plateaux a EXCLURE (un tiret dans leur titre faisait de faux "foot").
const TALK_SHOW_KEYWORDS = [
  'club', 'magazine', 'debrief', 'studio', 'multiplex', 'journal', 'edition',
  'late', 'talk', 'emission', 'chronique', 'plateau', 'avant-match', 'avant match',
  'apres-match', 'apres match', 'analyse', 'best of', 'resume', 'retro', 'zapping',
];
const MMA_KEYWORDS = [
  'ufc', 'mma', 'bellator', 'pfl', 'ksw', 'ares', 'cage warriors', 'oktagon',
  'octogone', 'arts martiaux', 'combat libre',
];
const GENERIC_SPORT_KEYWORDS = [
  'tennis', 'roland garros', 'wimbledon', 'formule 1', 'grand prix', 'nba',
  'rugby', 'top 14', 'boxe', 'basket', 'handball', 'jeux olympiques',
  'cyclisme', 'tour de france', 'athletisme', 'natation', 'ski', 'motogp',
  'moto gp', 'nfl', 'baseball', 'hockey', 'olympique', 'volley',
];
const PRIORITY_KEYWORDS = ['france', 'psg', 'paris sg', 'paris saint', 'ufc'];
const MAJOR_KEYWORDS = [
  'finale', 'final', 'ligue des champions', 'champions league', 'ufc',
  'france', 'coupe du monde', 'mondial', 'world cup', 'euro ', 'ligue des nations',
  'roland garros', 'wimbledon', 'grand prix', 'jeux olympiques', 'grand chelem',
];

function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function classify(title: string): Omit<SportEvent, 'channelId' | 'channelName' | 'title' | 'start'> | null {
  const t = norm(title);
  const isTalkShow = TALK_SHOW_KEYWORDS.some((k) => t.includes(k));
  const isMma = MMA_KEYWORDS.some((k) => t.includes(k));
  // Vrai match foot = competition explicite OU affiche "A vs/- B", jamais un
  // plateau (exclusions). Evite "Le Journal - Edition" / "Late Football Club".
  const isFoot =
    !isTalkShow && (FOOT_COMPETITIONS.some((k) => t.includes(k)) || VERSUS_RE.test(t));
  const isSport = !isTalkShow && GENERIC_SPORT_KEYWORDS.some((k) => t.includes(k));
  if (!isMma && !isFoot && !isSport) return null;
  return {
    kind: isMma ? 'mma' : isFoot ? 'foot' : 'sport',
    priority: PRIORITY_KEYWORDS.some((k) => t.includes(k)),
    major: MAJOR_KEYWORDS.some((k) => t.includes(k)),
  };
}

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
      const n = norm(c.name);
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
    .map((c) => ({ c, strong: STRONG_HINTS.some((h) => norm(c.name).includes(h)) }))
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
      const meta = classify(p.title);
      if (meta === null) continue;
      // Dedup : meme titre dans un creneau de 30 min (multi-chaines / doublons).
      const key = `${norm(p.title)}@${Math.round(p.start / (30 * 60 * 1000))}`;
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
