import type { EpgProgramme, NowNext } from '@/types/epg';
import type { XtreamShortEpg } from '@/types/xtream';

/** Normalisation de l'EPG brut Xtream (titres/description en base64). */

const BASE64 = /^[A-Za-z0-9+/\r\n]+={0,2}$/;

/** Decode un champ base64 UTF-8 ; renvoie l'entree telle quelle si ce n'en est pas. */
function decodeField(input: string | undefined): string {
  if (input === undefined || input === '') return '';
  if (!BASE64.test(input.trim())) return input;
  try {
    const binary = atob(input.replace(/\s/g, ''));
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder('utf-8').decode(bytes).trim();
  } catch {
    return input;
  }
}

function toMs(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : NaN;
  if (!Number.isFinite(n) || n <= 0) return null;
  // Timestamps Xtream en secondes.
  return Math.round(n * 1000);
}

/** Transforme la reponse get_short_epg en programmes tries par debut. */
export function normalizeShortEpg(raw: XtreamShortEpg): EpgProgramme[] {
  const listings = raw.epg_listings ?? [];
  const programmes: EpgProgramme[] = [];
  for (const item of listings) {
    const start = toMs(item.start_timestamp);
    const end = toMs(item.stop_timestamp);
    if (start === null || end === null || end <= start) continue;
    const title = decodeField(item.title);
    if (title === '') continue;
    const description = decodeField(item.description);
    programmes.push({ title, description: description !== '' ? description : null, start, end });
  }
  return programmes.sort((a, b) => a.start - b.start);
}

/** Programme en cours + suivant a l'instant `now` (ms). */
export function nowNext(programmes: EpgProgramme[], now: number): NowNext {
  let current: EpgProgramme | null = null;
  let next: EpgProgramme | null = null;
  for (const programme of programmes) {
    if (programme.start <= now && now < programme.end) current = programme;
    else if (programme.start > now && (next === null || programme.start < next.start)) next = programme;
  }
  return { current, next };
}
