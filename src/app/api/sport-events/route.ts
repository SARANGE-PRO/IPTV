import { NextResponse } from 'next/server';
import { classifySport } from '@/utils/sportClassify';

/**
 * Source EXTERNE optionnelle d'evenements sportifs pour le header d'accueil :
 * parse un (ou plusieurs) EPG XMLTV PUBLIC (ex. iptv-org/epg) et renvoie les
 * matchs foot / combats MMA a venir, deja classes. 100% metadonnees, 0 flux.
 *
 * DESACTIVEE par defaut : si `SPORT_EPG_URL` n'est pas configuree, renvoie une
 * liste vide et l'app retombe sur le scan EPG Xtream in-app. Mettre dans les env
 * Vercel : SPORT_EPG_URL=https://.../guide.xml (plusieurs URLs separees par des
 * virgules acceptees). Idealement rafraichi par un Vercel Cron.
 */
export const revalidate = 21_600; // 6 h
export const maxDuration = 60; // parse XMLTV multi-Mo

// Guide XMLTV public par defaut (iptv-org/epg) : programme-tv.net couvre les
// bouquets sport FR (Canal+, beIN, RMC Sport, Eurosport, La Chaine L'Equipe).
// Telerama en secours automatique. Surchargeable via env SPORT_EPG_URL.
const DEFAULT_EPG_URLS = [
  'https://iptv-org.github.io/epg/guides/fr/programme-tv.net.epg.xml',
  'https://iptv-org.github.io/epg/guides/fr/telerama.fr.epg.xml',
];

const HORIZON_MS = 7 * 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 25_000;
const MAX_EVENTS = 40;

export interface ExternalSportEvent {
  title: string;
  channel: string; // display-name XMLTV (ex. "beIN Sports 1")
  start: number; // epoch ms
  kind: 'foot' | 'mma' | 'sport';
  priority: boolean;
  major: boolean;
}

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#3[49];|&apos;/g, "'")
    .trim();
}

/** "20260703210000 +0100" -> epoch ms. */
function parseXmltvDate(s: string): number | null {
  const m = s.match(/^\s*(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\s*([+-]\d{4}))?/);
  if (m === null) return null;
  let ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]));
  const tz = m[7];
  if (tz !== undefined) {
    const sign = tz[0] === '-' ? 1 : -1; // +0100 => UTC = local - 1h
    ms += sign * (Number(tz.slice(1, 3)) * 60 + Number(tz.slice(3, 5))) * 60_000;
  }
  return ms;
}

function parseXmltv(xml: string, now: number): ExternalSportEvent[] {
  // id de chaine -> display-name
  const channels = new Map<string, string>();
  const chRe = /<channel\s+id="([^"]+)"[^>]*>([\s\S]*?)<\/channel>/g;
  let cm: RegExpExecArray | null;
  while ((cm = chRe.exec(xml)) !== null) {
    const name = cm[2]?.match(/<display-name[^>]*>([\s\S]*?)<\/display-name>/);
    if (cm[1] !== undefined && name?.[1] !== undefined) channels.set(cm[1], decodeEntities(name[1]));
  }

  const out: ExternalSportEvent[] = [];
  const prRe = /<programme\s+([^>]*?)>([\s\S]*?)<\/programme>/g;
  let pm: RegExpExecArray | null;
  while ((pm = prRe.exec(xml)) !== null) {
    const attrs = pm[1] ?? '';
    const body = pm[2] ?? '';
    const start = parseXmltvDate(attrs.match(/\bstart="([^"]+)"/)?.[1] ?? '');
    if (start === null || start < now || start > now + HORIZON_MS) continue;
    const title = decodeEntities(body.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1] ?? '');
    if (title === '') continue;
    const cls = classifySport(title);
    if (cls === null) continue;
    const chId = attrs.match(/\bchannel="([^"]+)"/)?.[1] ?? '';
    out.push({ title, channel: channels.get(chId) ?? chId, start, ...cls });
  }
  return out;
}

async function fetchXml(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, next: { revalidate } });
    if (!res.ok) return '';
    return await res.text();
  } catch {
    return '';
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(): Promise<NextResponse> {
  const configured = process.env.SPORT_EPG_URL?.trim() ?? '';
  const urls =
    configured === ''
      ? DEFAULT_EPG_URLS
      : configured.split(',').map((u) => u.trim()).filter(Boolean).slice(0, 4);
  const now = Date.now();
  const xmls = await Promise.all(urls.map(fetchXml));

  const seen = new Set<string>();
  const events: ExternalSportEvent[] = [];
  for (const xml of xmls) {
    if (xml === '') continue;
    for (const ev of parseXmltv(xml, now)) {
      const key = `${ev.title.toLowerCase()}@${Math.round(ev.start / (30 * 60 * 1000))}`;
      if (seen.has(key)) continue;
      seen.add(key);
      events.push(ev);
    }
  }
  events.sort((a, b) => a.start - b.start);

  return NextResponse.json(
    { ok: true, events: events.slice(0, MAX_EVENTS), source: 'xmltv' },
    { headers: { 'Cache-Control': 's-maxage=21600, stale-while-revalidate=86400' } },
  );
}
