import type { EpgProgramme, NowNext } from '@/types/epg';
import type { XtreamShortEpg } from '@/types/xtream';

/** Normalisation de l'EPG brut Xtream (titres/description en base64). */

const BASE64 = /^[A-Za-z0-9+/\r\n]+={0,2}$/;

/** Decode un champ base64 UTF-8 ; renvoie l'entree telle quelle si ce n'en est pas. */
function decodeField(input: string | undefined): string {
  if (input === undefined || input === '') return '';
  const trimmed = input.trim();
  // Le base64 a une longueur multiple de 4 (une fois les espaces retires) : ce
  // pre-filtre ecarte deja beaucoup de faux positifs.
  const compact = trimmed.replace(/\s/g, '');
  if (!BASE64.test(trimmed) || compact.length % 4 !== 0) return input;
  try {
    const binary = atob(compact);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const decoded = new TextDecoder('utf-8').decode(bytes).trim();
    // Un titre plain court (News/Foot/Golf/Judo) est alphanumerique et parfois
    // multiple de 4 -> il passe le test base64 par hasard. Si le decodage produit
    // un caractere de remplacement (octets non-UTF-8) ou du vide, ce n'etait PAS
    // du base64 : on garde le titre original.
    if (decoded === '' || decoded.includes('�')) return input;
    return decoded;
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
