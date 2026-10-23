import type { IncomingMessage } from 'node:http';
import { get as httpGet } from 'node:http';
import { get as httpsGet } from 'node:https';
import { createGunzip } from 'node:zlib';
import { guideChannelDisplay, isFootballGuideChannel } from '@/services/football/tvChannels';
import { referenceKey } from '@/services/live/channelNormalizer';
import type { TvSchedule, TvSlot } from '@/types/tvGuide';
import { matchFrenchChannel } from '@/utils/frenchChannelReference';

/**
 * GUIDE TV FRANCAIS (XMLTV xmltvfr.fr) -> diffusions de football (SERVEUR).
 *
 * Le guide complet pese ~16 Mo compresse / ~135 Mo decompresse (785 chaines,
 * 10 jours). Il est lu EN FLUX (fetch -> gunzip -> texte par blocs) : seules
 * les balises <channel>/<programme> des chaines nationales retenues sont
 * analysees, puis seuls les programmes de MATCHS de football sont gardes
 * (~quelques centaines d'entrees). Rien n'est jamais charge en entier.
 *
 * C'est la source de la chaine EXACTE de chaque match : les guides FR listent
 * les rencontres (« Hoffenheim / Lyon », « Ligue Europa - 3e journee ») sur la
 * chaine qui les diffuse, a l'heure du direct.
 *
 * La MEME lecture produit aussi le programme TV (24 h) des chaines du
 * referentiel FR (utils/frenchChannelReference) : « en cours » dans la liste
 * Live. Une seule analyse du fichier, un seul cache.
 */

export interface GuideProgramme {
  /** Identifiant du guide (« CanalPlusLive7.fr »). */
  channelId: string;
  /** Nom d'affichage (« Canal+ Live 7 »). */
  channel: string;
  start: number;
  end: number;
  title: string;
  subtitle: string | null;
}

export interface GuideData {
  ok: boolean;
  fetchedAt: number;
  programmes: GuideProgramme[];
  /** Programme des chaines FR (liste Live). */
  schedule: TvSchedule['channels'];
}

export interface ParsedGuide {
  football: GuideProgramme[];
  schedule: TvSchedule['channels'];
}

const DEFAULT_URLS = ['https://xmltvfr.fr/xmltv/xmltv.xml.gz', 'https://xmltvfr.fr/xmltv/xmltv_fr.xml'];
const FETCH_TIMEOUT_MS = 50_000;
/** Fenetre conservee : 6 h dans le passe (matchs en cours) a 11 jours. */
const PAST_MS = 6 * 3_600_000;
const FUTURE_MS = 11 * 86_400_000;
/** Programme TV : de 3 h avant a 27 h apres l'analyse (le cache dure 3 h). */
const SCHEDULE_PAST_MS = 3 * 3_600_000;
const SCHEDULE_FUTURE_MS = 27 * 3_600_000;
const SCHEDULE_TITLE_MAX = 80;

function guideUrls(): string[] {
  const configured = process.env.FOOTBALL_TV_GUIDE_URL?.trim() ?? '';
  if (configured === '') return DEFAULT_URLS;
  return configured
    .split(',')
    .map((u) => u.trim())
    .filter(Boolean)
    .slice(0, 3);
}

function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&')
    .trim();
}

/** « 20261022184500 +0200 » -> epoch ms (UTC). */
export function parseXmltvDate(value: string): number | null {
  const m = /^\s*(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?(?:\s*([+-])(\d{2})(\d{2}))?/.exec(value);
  if (m === null) return null;
  let ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] ?? '0'));
  if (m[7] !== undefined) {
    const offset = (Number(m[8]) * 60 + Number(m[9])) * 60_000;
    ms += m[7] === '+' ? -offset : offset;
  }
  return ms;
}

function textOf(body: string, tag: string): string | null {
  const m = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`).exec(body);
  return m?.[1] !== undefined ? decode(m[1]) : null;
}

function categoriesOf(body: string): string[] {
  const out: string[] = [];
  const re = /<category\b[^>]*>([\s\S]*?)<\/category>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) if (m[1] !== undefined) out.push(decode(m[1]).toLowerCase());
  return out;
}

const NOT_LIVE = /(archives?|best of|resume|résumé|temps forts|highlights|rediffusion|magazine|avant-match|apres-match|après-match|plateau|conference de presse|conférence de presse)/i;

/**
 * Programme = MATCH de football (ou multiplex) : categorie « Football » (hors
 * football americain / magazines), ou titre « Football : … », et une affiche
 * « A / B » ou un multiplex. Les archives/resumes/plateaux sont exclus.
 */
export function isFootballListing(title: string, subtitle: string | null, categories: string[]): boolean {
  const text = `${title} ${subtitle ?? ''}`;
  if (NOT_LIVE.test(text)) return false;
  if (/football am[ée]ricain|\bnfl\b|futsal|beach soccer/i.test(text)) return false;
  const footCategory = categories.some((c) => c === 'football');
  const magCategory = categories.some((c) => c.includes('mag') || c.includes('documentaire'));
  const footTitle = /^football\s*:/i.test(title);
  if (!(footCategory || footTitle) || (magCategory && !footTitle)) return false;
  return text.includes(' / ') || /multiplex/i.test(text);
}

/**
 * Analyse un flux texte XMLTV et renvoie les programmes de football des
 * chaines retenues. Exportee pour les tests (fichier local).
 */
export async function parseGuideStream(chunks: AsyncIterable<string>, now: number): Promise<GuideProgramme[]> {
  return (await parseGuide(chunks, now)).football;
}

/** Guide -> nom du referentiel FR (« France 2 ») ; null : chaine hors referentiel. */
function scheduleName(displayName: string): string | null {
  const ref = matchFrenchChannel(referenceKey(displayName));
  return ref !== null && ref.country === null && ref.name !== null ? ref.name : null;
}

/** Analyse complete : matchs de football + programme 24 h des chaines FR. */
export async function parseGuide(chunks: AsyncIterable<string>, now: number): Promise<ParsedGuide> {
  const channels = new Map<string, string>();
  /** Chaine du guide -> nom du referentiel (premiere chaine du guide qui le revendique). */
  const scheduleIds = new Map<string, string>();
  const claimed = new Set<string>();
  const schedule: TvSchedule['channels'] = {};
  const out: GuideProgramme[] = [];
  const from = now - PAST_MS;
  const to = now + FUTURE_MS;
  const scheduleFrom = now - SCHEDULE_PAST_MS;
  const scheduleTo = now + SCHEDULE_FUTURE_MS;
  let buf = '';

  const consume = (final: boolean): void => {
    let pos = 0;
    for (;;) {
      const p = buf.indexOf('<programme ', pos);
      const c = buf.indexOf('<channel ', pos);
      const startIdx = p === -1 ? c : c === -1 ? p : Math.min(p, c);
      if (startIdx === -1) {
        // Garde une petite queue (balise coupee entre deux blocs).
        pos = Math.max(pos, buf.length - 16);
        break;
      }
      const isProgramme = startIdx === p;
      const closeTag = isProgramme ? '</programme>' : '</channel>';
      const endIdx = buf.indexOf(closeTag, startIdx);
      if (endIdx === -1) {
        pos = startIdx;
        break;
      }
      const block = buf.slice(startIdx, endIdx);
      pos = endIdx + closeTag.length;
      const headEnd = block.indexOf('>');
      const head = block.slice(0, headEnd);
      const id = /\b(?:channel|id)="([^"]+)"/.exec(head)?.[1];
      if (id === undefined) continue;
      const football = isFootballGuideChannel(id);
      if (!isProgramme) {
        const name = textOf(block.slice(headEnd + 1), 'display-name');
        if (name === null) continue;
        if (football) channels.set(id, guideChannelDisplay(id, name));
        const refName = scheduleName(name);
        if (refName !== null && !claimed.has(refName)) {
          claimed.add(refName);
          scheduleIds.set(id, refName);
        }
        continue;
      }
      const refName = scheduleIds.get(id);
      if (!football && refName === undefined) continue;
      const body = block.slice(headEnd + 1);
      const start = parseXmltvDate(/\bstart="([^"]+)"/.exec(head)?.[1] ?? '');
      const end = parseXmltvDate(/\bstop="([^"]+)"/.exec(head)?.[1] ?? '');
      if (start === null) continue;
      if (refName !== undefined && (end ?? start) > scheduleFrom && start < scheduleTo) {
        const t = textOf(body, 'title');
        if (t !== null && t !== '') {
          const slot: TvSlot = [
            Math.floor(start / 60_000),
            Math.floor((end ?? start + 3_600_000) / 60_000),
            t.length > SCHEDULE_TITLE_MAX ? `${t.slice(0, SCHEDULE_TITLE_MAX - 1)}…` : t,
          ];
          (schedule[refName] ??= []).push(slot);
        }
      }
      if (!football || start < from || start > to) continue;
      const title = textOf(body, 'title') ?? '';
      const subtitle = textOf(body, 'sub-title');
      if (title === '' || !isFootballListing(title, subtitle, categoriesOf(body))) continue;
      out.push({
        channelId: id,
        channel: channels.get(id) ?? guideChannelDisplay(id, id.replace(/\.fr$/, '')),
        start,
        end: end ?? start + 2 * 3_600_000,
        title,
        subtitle,
      });
    }
    buf = final ? '' : buf.slice(pos);
  };

  for await (const chunk of chunks) {
    buf += chunk;
    consume(false);
  }
  consume(true);
  // Les <channel> precedent normalement les programmes ; au cas ou, on corrige.
  for (const p of out) {
    const name = channels.get(p.channelId);
    if (name !== undefined) p.channel = name;
  }
  for (const slots of Object.values(schedule)) slots.sort((a, b) => a[0] - b[0]);
  return { football: out.sort((a, b) => a.start - b.start), schedule };
}

/**
 * Telechargement en flux via le client HTTP NATIF de Node (et non `fetch` :
 * celui de Next est instrumente — memoisation/duplication du corps — et se
 * bloquait sur ce fichier de 16 Mo). Redirections suivies (3 max). Toute
 * erreur (reseau, HTTP, gzip, delai) est propagee au flux -> rejet de
 * l'iteration -> attrapee par l'appelant : jamais d'exception non geree.
 */
function openStream(url: string, deadline: number, redirects = 3): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    const getter = url.startsWith('https:') ? httpsGet : httpGet;
    const req = getter(url, { headers: { 'accept-encoding': 'gzip', 'user-agent': 'ZiBTV/1.0 (+football tv guide)' } }, (res) => {
      const status = res.statusCode ?? 0;
      const location = res.headers.location;
      if (status >= 300 && status < 400 && location !== undefined && redirects > 0) {
        res.resume();
        openStream(new URL(location, url).toString(), deadline, redirects - 1).then(resolve, reject);
        return;
      }
      if (status !== 200) {
        res.resume();
        reject(new Error(`guide HTTP ${status}`));
        return;
      }
      resolve(res);
    });
    req.on('error', reject);
    req.setTimeout(Math.max(1000, deadline - Date.now()), () => req.destroy(new Error('guide timeout')));
  });
}

async function* textChunks(url: string, deadline: number): AsyncGenerator<string> {
  const res = await openStream(url, deadline);
  const gzipped = url.endsWith('.gz') || /gzip/i.test(String(res.headers['content-encoding'] ?? ''));
  const stream = gzipped ? res.pipe(createGunzip()) : res;
  if (gzipped) res.on('error', (err) => stream.destroy(err)); // pipe() ne propage pas les erreurs
  const timer = setTimeout(() => {
    const err = new Error('guide timeout');
    res.destroy(err);
    stream.destroy(err);
  }, Math.max(1000, deadline - Date.now()));
  try {
    stream.setEncoding('utf8');
    for await (const chunk of stream) yield chunk as string;
  } finally {
    clearTimeout(timer);
    res.destroy();
    if (stream !== res) stream.destroy();
  }
}

/** Telecharge et analyse le guide (premiere URL qui repond). Ne jette jamais. */
export async function fetchFootballGuide(): Promise<GuideData> {
  const now = Date.now();
  for (const url of guideUrls()) {
    try {
      const { football, schedule } = await parseGuide(textChunks(url, Date.now() + FETCH_TIMEOUT_MS), now);
      if (football.length > 0 || Object.keys(schedule).length > 0) {
        return { ok: true, fetchedAt: now, programmes: football, schedule };
      }
    } catch {
      // URL suivante.
    }
  }
  return { ok: false, fetchedAt: now, programmes: [], schedule: {} };
}
