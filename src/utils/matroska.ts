import type { MatroskaSummary, MatroskaVideoTrack } from '@/types/directMkvProbe';

/**
 * Lecteur EBML/Matroska minimal : parcourt l'EN-TETE d'un fichier (les premiers
 * Mo) pour en extraire les pistes (codecs, resolution, langues) — rien d'autre.
 * Pur (aucune I/O), utilise par la sonde de lecture directe et, plus tard, par
 * le remuxeur cote client.
 *
 * Reference : https://www.matroska.org/technical/elements.html
 */

const ID = {
  EBML: 0x1a45dfa3,
  DocType: 0x4282,
  Segment: 0x18538067,
  Info: 0x1549a966,
  TimecodeScale: 0x2ad7b1,
  Duration: 0x4489,
  Tracks: 0x1654ae6b,
  TrackEntry: 0xae,
  TrackType: 0x83,
  FlagDefault: 0x88,
  CodecID: 0x86,
  CodecPrivate: 0x63a2,
  Language: 0x22b59c,
  LanguageIETF: 0x22b59d,
  Name: 0x536e,
  Video: 0xe0,
  PixelWidth: 0xb0,
  PixelHeight: 0xba,
  Audio: 0xe1,
  SamplingFrequency: 0xb5,
  Channels: 0x9f,
  Cluster: 0x1f43b675,
} as const;

/** Elements « maitres » dans lesquels on DESCEND (les autres sont sautes). */
const MASTER = new Set<number>([ID.EBML, ID.Segment, ID.Info, ID.Tracks, ID.TrackEntry, ID.Video, ID.Audio]);

const UNKNOWN_SIZE = -1;

interface Vint {
  value: number;
  length: number;
}

/** Identifiant EBML : longueur donnee par les bits de tete, marqueur CONSERVE. */
function readId(buf: Uint8Array, pos: number): Vint | null {
  const first = buf[pos];
  if (first === undefined || first === 0) return null;
  let length = 1;
  let mask = 0x80;
  while ((first & mask) === 0 && length < 4) {
    mask >>= 1;
    length += 1;
  }
  if (pos + length > buf.length) return null;
  let value = 0;
  for (let i = 0; i < length; i += 1) value = value * 256 + (buf[pos + i] ?? 0);
  return { value, length };
}

/** Taille EBML : marqueur retire ; tous bits a 1 = taille inconnue. */
function readSize(buf: Uint8Array, pos: number): Vint | null {
  const first = buf[pos];
  if (first === undefined || first === 0) return null;
  let length = 1;
  let mask = 0x80;
  while ((first & mask) === 0 && length < 8) {
    mask >>= 1;
    length += 1;
  }
  if (pos + length > buf.length) return null;
  let value = first & (mask - 1);
  let allOnes = value === mask - 1;
  for (let i = 1; i < length; i += 1) {
    const b = buf[pos + i] ?? 0;
    if (b !== 0xff) allOnes = false;
    value = value * 256 + b;
  }
  return { value: allOnes ? UNKNOWN_SIZE : value, length };
}

function readUint(buf: Uint8Array, pos: number, len: number): number {
  let v = 0;
  for (let i = 0; i < len; i += 1) v = v * 256 + (buf[pos + i] ?? 0);
  return v;
}

function readFloat(buf: Uint8Array, pos: number, len: number): number | null {
  const view = new DataView(buf.buffer, buf.byteOffset + pos, len);
  if (len === 4) return view.getFloat32(0);
  if (len === 8) return view.getFloat64(0);
  return null;
}

function readString(buf: Uint8Array, pos: number, len: number): string {
  return new TextDecoder('utf-8').decode(buf.subarray(pos, pos + len)).replace(/\0+$/, '');
}

/** Profil/niveau/bit depth depuis un HEVCDecoderConfigurationRecord (hvcC). */
function parseHvcC(p: Uint8Array): Pick<MatroskaVideoTrack, 'profile' | 'level' | 'bitDepth'> {
  if (p.length < 23) return { profile: null, level: null, bitDepth: null };
  return { profile: (p[1] ?? 0) & 0x1f, level: p[12] ?? null, bitDepth: ((p[17] ?? 0) & 0x07) + 8 };
}

/** Profil/niveau depuis un AVCDecoderConfigurationRecord (avcC). */
function parseAvcC(p: Uint8Array): Pick<MatroskaVideoTrack, 'profile' | 'level' | 'bitDepth'> {
  if (p.length < 4) return { profile: null, level: null, bitDepth: null };
  return { profile: p[1] ?? null, level: p[3] ?? null, bitDepth: 8 };
}

interface TrackDraft {
  type: number | null;
  codecId: string | null;
  codecPrivate: Uint8Array | null;
  language: string | null;
  languageIetf: string | null;
  name: string | null;
  isDefault: boolean;
  width: number | null;
  height: number | null;
  channels: number | null;
  sampleRate: number | null;
}

function emptyDraft(): TrackDraft {
  return {
    type: null,
    codecId: null,
    codecPrivate: null,
    language: null,
    languageIetf: null,
    name: null,
    isDefault: true,
    width: null,
    height: null,
    channels: null,
    sampleRate: null,
  };
}

/**
 * Parse l'en-tete Matroska contenu dans `buf` (debut du fichier). Tolerant :
 * s'arrete proprement si le tampon est tronque. `tracksFound` dit si l'element
 * Tracks a ete rencontre en entier (sinon, il faut lire plus loin).
 */
export function parseMatroskaHeader(buf: Uint8Array): MatroskaSummary {
  const summary: MatroskaSummary = {
    docType: null,
    segmentSize: null,
    durationSecs: null,
    tracksFound: false,
    video: [],
    audio: [],
    subtitles: [],
  };
  const head = readId(buf, 0);
  if (head === null || head.value !== ID.EBML) return summary;

  let timecodeScale = 1_000_000; // ns par unite (defaut Matroska)
  let rawDuration: number | null = null;
  let draft: TrackDraft | null = null;

  const flush = () => {
    if (draft === null || draft.codecId === null) return;
    const lang = draft.languageIetf ?? draft.language;
    if (draft.type === 1) {
      const priv = draft.codecPrivate;
      const extra =
        priv !== null && /HEVC/i.test(draft.codecId)
          ? parseHvcC(priv)
          : priv !== null && /AVC/i.test(draft.codecId)
            ? parseAvcC(priv)
            : { profile: null, level: null, bitDepth: null };
      summary.video.push({ codecId: draft.codecId, width: draft.width, height: draft.height, ...extra });
    } else if (draft.type === 2) {
      summary.audio.push({
        codecId: draft.codecId,
        channels: draft.channels,
        sampleRate: draft.sampleRate,
        language: lang,
        name: draft.name,
        isDefault: draft.isDefault,
      });
    } else if (draft.type === 17) {
      summary.subtitles.push({ codecId: draft.codecId, language: lang, name: draft.name });
    }
  };

  // Pile des fins d'elements maitres (pour savoir quand on sort d'un TrackEntry).
  const ends: { id: number; end: number }[] = [];
  let pos = 0;
  while (pos < buf.length) {
    // Sortie d'elements maitres termines.
    while (ends.length > 0 && pos >= (ends[ends.length - 1]?.end ?? Infinity)) {
      const done = ends.pop();
      if (done?.id === ID.TrackEntry) {
        flush();
        draft = null;
      } else if (done?.id === ID.Tracks) {
        summary.tracksFound = true;
      }
    }
    const id = readId(buf, pos);
    if (id === null) break;
    const size = readSize(buf, pos + id.length);
    if (size === null) break;
    const dataStart = pos + id.length + size.length;
    const dataEnd = size.value === UNKNOWN_SIZE ? Number.MAX_SAFE_INTEGER : dataStart + size.value;

    if (id.value === ID.Cluster) break; // les donnees commencent : fini.

    if (MASTER.has(id.value)) {
      if (id.value === ID.Segment && size.value !== UNKNOWN_SIZE) summary.segmentSize = size.value;
      if (id.value === ID.TrackEntry) draft = emptyDraft();
      ends.push({ id: id.value, end: dataEnd });
      pos = dataStart;
      continue;
    }

    // Element feuille : tronque -> on ne peut plus rien lire de fiable.
    if (dataEnd > buf.length) break;
    const len = size.value;
    switch (id.value) {
      case ID.DocType:
        summary.docType = readString(buf, dataStart, len);
        break;
      case ID.TimecodeScale:
        timecodeScale = readUint(buf, dataStart, len);
        break;
      case ID.Duration:
        rawDuration = readFloat(buf, dataStart, len);
        break;
      case ID.TrackType:
        if (draft) draft.type = readUint(buf, dataStart, len);
        break;
      case ID.FlagDefault:
        if (draft) draft.isDefault = readUint(buf, dataStart, len) !== 0;
        break;
      case ID.CodecID:
        if (draft) draft.codecId = readString(buf, dataStart, len);
        break;
      case ID.CodecPrivate:
        if (draft) draft.codecPrivate = buf.slice(dataStart, dataEnd);
        break;
      case ID.Language:
        if (draft) draft.language = readString(buf, dataStart, len);
        break;
      case ID.LanguageIETF:
        if (draft) draft.languageIetf = readString(buf, dataStart, len);
        break;
      case ID.Name:
        if (draft) draft.name = readString(buf, dataStart, len);
        break;
      case ID.PixelWidth:
        if (draft) draft.width = readUint(buf, dataStart, len);
        break;
      case ID.PixelHeight:
        if (draft) draft.height = readUint(buf, dataStart, len);
        break;
      case ID.Channels:
        if (draft) draft.channels = readUint(buf, dataStart, len);
        break;
      case ID.SamplingFrequency:
        if (draft) draft.sampleRate = readFloat(buf, dataStart, len);
        break;
      default:
        break;
    }
    pos = dataEnd;
  }
  // Fin de tampon au milieu d'un TrackEntry : on garde ce qu'on a lu.
  if (draft !== null) flush();
  if (rawDuration !== null) summary.durationSecs = (rawDuration * timecodeScale) / 1e9;
  return summary;
}

/** Libelle court d'un CodecID Matroska. */
export function codecLabel(codecId: string): string {
  const c = codecId.toUpperCase();
  if (c.startsWith('V_MPEGH/ISO/HEVC')) return 'HEVC (H.265)';
  if (c.startsWith('V_MPEG4/ISO/AVC')) return 'H.264';
  if (c.startsWith('V_AV1')) return 'AV1';
  if (c.startsWith('V_VP9')) return 'VP9';
  if (c.startsWith('V_MPEG4')) return 'MPEG-4 ASP (Xvid)';
  if (c.startsWith('A_AAC')) return 'AAC';
  if (c === 'A_AC3' || c.startsWith('A_AC3/')) return 'AC-3 (Dolby Digital)';
  if (c === 'A_EAC3') return 'E-AC-3 (Dolby Digital+)';
  if (c.startsWith('A_DTS')) return 'DTS';
  if (c === 'A_TRUEHD' || c === 'A_MLP') return 'TrueHD';
  if (c === 'A_OPUS') return 'Opus';
  if (c === 'A_FLAC') return 'FLAC';
  if (c === 'A_VORBIS') return 'Vorbis';
  if (c === 'A_MPEG/L3') return 'MP3';
  if (c === 'A_MPEG/L2') return 'MP2';
  if (c.startsWith('A_PCM')) return 'PCM';
  if (c === 'S_TEXT/UTF8') return 'SRT';
  if (c === 'S_TEXT/ASS' || c === 'S_TEXT/SSA') return 'ASS/SSA';
  if (c === 'S_HDMV/PGS') return 'PGS (bitmap)';
  if (c === 'S_VOBSUB') return 'VobSub (bitmap)';
  return codecId;
}
