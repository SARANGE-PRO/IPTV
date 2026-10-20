import type {
  DirectFetchOutcome,
  DirectMkvProbeResult,
  DirectMkvVerdict,
  MatroskaSummary,
  MseCapabilities,
} from '@/types/directMkvProbe';
import { parseMatroskaHeader, toSummary } from '@/utils/matroska';

/**
 * Sonde « lecture directe d'un MKV » : depuis le NAVIGATEUR (IP du client,
 * page HTTP), peut-on lire les premiers octets du flux Xtream en fetch, avec
 * des requetes partielles (Range) ? Et les codecs du fichier sont-ils decodables
 * par MediaSource sur cet appareil ? C'est le test de faisabilite du remux
 * MKV -> fMP4 cote client, sans passerelle.
 *
 * Ne telecharge jamais plus de quelques Mo (lecture par flux puis annulation),
 * ne persiste rien, ne journalise ni URL ni identifiant.
 */

const FIRST_CHUNK = 1 << 20; // 1 Mo : les pistes sont presque toujours la.
const SECOND_CHUNK = 4 << 20; // sinon, on va jusqu'a 4 Mo.
const TIMEOUT_MS = 20_000;

interface RangeRead {
  status: number;
  contentType: string | null;
  bytes: Uint8Array;
}

/** Lit au plus `max` octets a partir de `start`, puis ANNULE le corps. */
async function readSlice(url: string, start: number, max: number, withRange: boolean): Promise<RangeRead> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const headers: Record<string, string> = withRange ? { Range: `bytes=${start}-${start + max - 1}` } : {};
    const res = await fetch(url, {
      method: 'GET',
      headers,
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'follow',
      signal: controller.signal,
    });
    const contentType = res.headers.get('content-type');
    if (!res.ok || res.body === null) {
      await res.body?.cancel().catch(() => {});
      return { status: res.status, contentType, bytes: new Uint8Array(0) };
    }
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (total < max) {
      const { done, value } = await reader.read();
      if (done || value === undefined) break;
      chunks.push(value);
      total += value.byteLength;
    }
    await reader.cancel().catch(() => {});
    const out = new Uint8Array(Math.min(total, max));
    let off = 0;
    for (const c of chunks) {
      const take = Math.min(c.byteLength, out.length - off);
      if (take <= 0) break;
      out.set(c.subarray(0, take), off);
      off += take;
    }
    // Sans Range, on a lu depuis 0 : on ne garde que la fenetre demandee.
    return { status: res.status, contentType, bytes: withRange ? out : out.subarray(Math.min(start, out.length)) };
  } finally {
    clearTimeout(timer);
  }
}

function isAbort(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError';
}

function mseType(mime: string): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as {
    ManagedMediaSource?: { isTypeSupported?: (t: string) => boolean };
    MediaSource?: { isTypeSupported?: (t: string) => boolean };
  };
  const ms = w.ManagedMediaSource ?? w.MediaSource;
  try {
    return ms?.isTypeSupported?.(mime) === true;
  } catch {
    return false;
  }
}

export function detectMseCapabilities(): MseCapabilities {
  const w = typeof window === 'undefined' ? {} : (window as unknown as Record<string, unknown>);
  return {
    managedMediaSource: 'ManagedMediaSource' in w,
    mediaSource: 'MediaSource' in w,
    hevcMain: mseType('video/mp4; codecs="hvc1.1.6.L120.B0"'),
    hevcMain10: mseType('video/mp4; codecs="hvc1.2.4.L120.B0"'),
    avc: mseType('video/mp4; codecs="avc1.640028"'),
    aac: mseType('audio/mp4; codecs="mp4a.40.2"'),
    ac3: mseType('audio/mp4; codecs="ac-3"'),
    eac3: mseType('audio/mp4; codecs="ec-3"'),
    opus: mseType('audio/mp4; codecs="opus"'),
    flac: mseType('audio/mp4; codecs="flac"'),
    mp3: mseType('audio/mp4; codecs="mp4a.40.34"') || mseType('audio/mpeg'),
  };
}

function videoPlayable(codecId: string, bitDepth: number | null, profile: number | null, mse: MseCapabilities): boolean {
  const c = codecId.toUpperCase();
  if (c.startsWith('V_MPEG4/ISO/AVC')) return mse.avc;
  if (c.startsWith('V_MPEGH/ISO/HEVC')) {
    const tenBit = (bitDepth !== null && bitDepth > 8) || profile === 2;
    return tenBit ? mse.hevcMain10 : mse.hevcMain || mse.hevcMain10;
  }
  return false;
}

function audioPlayable(codecId: string, mse: MseCapabilities): boolean {
  const c = codecId.toUpperCase();
  if (c.startsWith('A_AAC')) return mse.aac;
  if (c === 'A_AC3' || c.startsWith('A_AC3/')) return mse.ac3;
  if (c === 'A_EAC3') return mse.eac3;
  if (c === 'A_OPUS') return mse.opus;
  if (c === 'A_FLAC') return mse.flac;
  if (c === 'A_MPEG/L3') return mse.mp3;
  return false; // DTS, TrueHD, Vorbis, PCM… : hors navigateur
}

function decide(
  fetchOutcome: DirectFetchOutcome,
  mk: MatroskaSummary | null,
  mse: MseCapabilities,
): { verdict: DirectMkvVerdict; reason: string; playableVideo: string[]; playableAudio: string[] } {
  const none = { playableVideo: [] as string[], playableAudio: [] as string[] };
  if (fetchOutcome === 'mixed-content') {
    return { verdict: 'mixed-content', reason: 'Page en HTTPS : le flux HTTP est bloqué avant même le test. À lancer depuis la coquille HTTP.', ...none };
  }
  if (fetchOutcome === 'cors-blocked') {
    return { verdict: 'cors-blocked', reason: "Le serveur Xtream n'autorise pas la lecture par fetch (pas d'en-têtes CORS). Le remux côté client est impossible ; VLC ou passerelle.", ...none };
  }
  if (fetchOutcome === 'timeout' || fetchOutcome === 'http-error') {
    return { verdict: 'inconnu', reason: fetchOutcome === 'timeout' ? 'Délai dépassé : flux injoignable ou trop lent.' : 'Le serveur a répondu une erreur HTTP.', ...none };
  }
  if (!mse.managedMediaSource && !mse.mediaSource) {
    return { verdict: 'mse-unavailable', reason: 'Ce navigateur n’expose ni MediaSource ni ManagedMediaSource (iOS < 17.1 ?). Le remux côté client est impossible ici.', ...none };
  }
  if (mk === null || mk.docType === null || !/matroska|webm/i.test(mk.docType)) {
    return { verdict: 'not-matroska', reason: "Le début du fichier n'est pas un en-tête Matroska lisible.", ...none };
  }
  if (!mk.tracksFound && mk.video.length === 0) {
    return { verdict: 'inconnu', reason: 'Pistes non trouvées dans les premiers Mo (en-tête atypique).', ...none };
  }
  const playableVideo = mk.video.filter((v) => videoPlayable(v.codecId, v.bitDepth, v.profile, mse)).map((v) => v.codecId);
  const playableAudio = mk.audio.filter((a) => audioPlayable(a.codecId, mse)).map((a) => a.codecId);
  if (playableVideo.length === 0) {
    return { verdict: 'video-unsupported', reason: 'La vidéo n’est pas décodable par cet appareil via MediaSource (codec ou profil non supporté).', playableVideo, playableAudio };
  }
  if (playableAudio.length === 0) {
    return { verdict: 'audio-unsupported', reason: 'Aucune piste audio décodable (DTS / TrueHD…). Il faudrait transcoder l’audio côté client.', playableVideo, playableAudio };
  }
  if (fetchOutcome === 'range-ok') {
    return { verdict: 'possible', reason: 'Fetch direct + Range OK, vidéo et au moins une piste audio décodables : le remux côté client est faisable, avec avance rapide.', playableVideo, playableAudio };
  }
  return { verdict: 'possible-sans-seek', reason: 'Fetch direct OK mais sans requêtes partielles : lecture possible depuis le début seulement (pas d’avance rapide fiable).', playableVideo, playableAudio };
}

/** Lance la sonde sur l'URL DIRECTE Xtream (jamais la passerelle). Ne jette jamais. */
export async function probeDirectMkv(streamUrl: string): Promise<DirectMkvProbeResult> {
  const mse = detectMseCapabilities();
  const base = { generatedAt: new Date().toISOString(), mse };
  const onHttpsPage = typeof window !== 'undefined' && window.location.protocol === 'https:';
  if (onHttpsPage && /^http:\/\//i.test(streamUrl)) {
    const d = decide('mixed-content', null, mse);
    return { ...base, fetch: 'mixed-content', httpStatus: null, contentType: null, bytesRead: 0, matroska: null, ...d };
  }

  let outcome: DirectFetchOutcome;
  let read: RangeRead | null = null;
  try {
    read = await readSlice(streamUrl, 0, FIRST_CHUNK, true);
    outcome = read.status === 206 ? 'range-ok' : read.status === 200 ? 'range-ignored' : 'http-error';
  } catch (e) {
    if (isAbort(e)) {
      outcome = 'timeout';
    } else {
      // TypeError : CORS (ou reseau). On distingue « CORS absent » de « Range
      // refuse au preflight » en retentant SANS en-tete Range.
      try {
        read = await readSlice(streamUrl, 0, FIRST_CHUNK, false);
        outcome = read.status === 200 ? 'range-preflight-blocked' : 'http-error';
      } catch (e2) {
        outcome = isAbort(e2) ? 'timeout' : 'cors-blocked';
      }
    }
  }

  let matroska: MatroskaSummary | null = null;
  let bytesRead = read?.bytes.byteLength ?? 0;
  if (read !== null && read.bytes.byteLength > 0) {
    matroska = toSummary(parseMatroskaHeader(read.bytes));
    // Pistes absentes du 1er Mo : on lit plus loin (si Range marche).
    if (!matroska.tracksFound && outcome === 'range-ok') {
      try {
        const more = await readSlice(streamUrl, 0, SECOND_CHUNK, true);
        if (more.bytes.byteLength > read.bytes.byteLength) {
          matroska = toSummary(parseMatroskaHeader(more.bytes));
          bytesRead = more.bytes.byteLength;
        }
      } catch {
        // On garde la 1re analyse.
      }
    }
  }

  const d = decide(outcome, matroska, mse);
  return {
    ...base,
    fetch: outcome,
    httpStatus: read?.status ?? null,
    contentType: read?.contentType ?? null,
    bytesRead,
    matroska,
    ...d,
  };
}
