import type { MatroskaSummary } from '@/types/directMkvProbe';
import type { CuePoint, MatroskaBlock, MatroskaHeader, MatroskaTrack } from '@/types/mkvDirect';

/**
 * Lecteur EBML/Matroska minimal, PUR (aucune I/O, aucun DOM) :
 *  - `parseMatroskaHeader` : en-tete (pistes, codecs, SeekHead -> Cues, 1er Cluster) ;
 *  - `parseCues` : index de seek ;
 *  - `MatroskaClusterReader` : lecture INCREMENTALE des Clusters (blocs/trames) ;
 *  - `toSummary` / `codecLabel` : vue anonymisee pour le diagnostic.
 *
 * Reference : https://www.matroska.org/technical/elements.html
 */

const ID = {
  EBML: 0x1a45dfa3,
  DocType: 0x4282,
  Segment: 0x18538067,
  SeekHead: 0x114d9b74,
  Seek: 0x4dbb,
  SeekID: 0x53ab,
  SeekPosition: 0x53ac,
  Info: 0x1549a966,
  TimecodeScale: 0x2ad7b1,
  Duration: 0x4489,
  Tracks: 0x1654ae6b,
  TrackEntry: 0xae,
  TrackNumber: 0xd7,
  TrackType: 0x83,
  FlagDefault: 0x88,
  DefaultDuration: 0x23e383,
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
  OutputSamplingFrequency: 0x78b5,
  Channels: 0x9f,
  Cluster: 0x1f43b675,
  ClusterTimestamp: 0xe7,
  SimpleBlock: 0xa3,
  BlockGroup: 0xa0,
  Block: 0xa1,
  ReferenceBlock: 0xfb,
  Cues: 0x1c53bb6b,
  CuePoint: 0xbb,
  CueTime: 0xb3,
  CueTrackPositions: 0xb7,
  CueTrack: 0xf7,
  CueClusterPosition: 0xf1,
} as const;

/** Elements « maitres » de l'en-tete dans lesquels on DESCEND. */
const HEADER_MASTER = new Set<number>([
  ID.EBML, ID.Segment, ID.SeekHead, ID.Seek, ID.Info, ID.Tracks, ID.TrackEntry, ID.Video, ID.Audio,
]);

const UNKNOWN_SIZE = -1;

interface Vint {
  value: number;
  length: number;
}

/** Identifiant EBML : longueur donnee par les bits de tete, marqueur CONSERVE. */
export function readId(buf: Uint8Array, pos: number): Vint | null {
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

/** Taille EBML : marqueur retire ; tous bits a 1 = taille inconnue (UNKNOWN_SIZE). */
export function readSize(buf: Uint8Array, pos: number): Vint | null {
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

function bytesEqual(a: Uint8Array, b: number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

function trackType(t: number | null): MatroskaTrack['type'] {
  if (t === 1) return 'video';
  if (t === 2) return 'audio';
  if (t === 17) return 'subtitle';
  return 'other';
}

function emptyTrack(): MatroskaTrack {
  return {
    number: 0,
    type: 'other',
    codecId: '',
    codecPrivate: null,
    defaultDurationNs: null,
    language: null,
    name: null,
    isDefault: true,
    width: null,
    height: null,
    channels: null,
    sampleRate: null,
    outputSampleRate: null,
  };
}

/**
 * Parse l'en-tete Matroska contenu dans `buf` (debut du fichier, offset 0).
 * Tolerant : s'arrete proprement si le tampon est tronque. S'arrete au premier
 * Cluster (dont il note la position absolue).
 */
export function parseMatroskaHeader(buf: Uint8Array): MatroskaHeader {
  const header: MatroskaHeader = {
    docType: null,
    timecodeScale: 1_000_000,
    durationSecs: null,
    segmentDataStart: null,
    segmentSize: null,
    tracks: [],
    tracksFound: false,
    firstClusterPos: null,
    cuesPos: null,
  };
  const head = readId(buf, 0);
  if (head === null || head.value !== ID.EBML) return header;

  let rawDuration: number | null = null;
  let draft: MatroskaTrack | null = null;
  let seekId: Uint8Array | null = null;
  let seekPos: number | null = null;
  let languageIetf: string | null = null;

  const flushTrack = () => {
    if (draft !== null && draft.codecId !== '') {
      if (languageIetf !== null) draft.language = languageIetf;
      header.tracks.push(draft);
    }
    draft = null;
    languageIetf = null;
  };
  const flushSeek = () => {
    if (seekId !== null && seekPos !== null && header.segmentDataStart !== null) {
      if (bytesEqual(seekId, [0x1c, 0x53, 0xbb, 0x6b])) header.cuesPos = header.segmentDataStart + seekPos;
    }
    seekId = null;
    seekPos = null;
  };

  const ends: { id: number; end: number }[] = [];
  let pos = 0;
  while (pos < buf.length) {
    while (ends.length > 0 && pos >= (ends[ends.length - 1]?.end ?? Infinity)) {
      const done = ends.pop();
      if (done?.id === ID.TrackEntry) flushTrack();
      else if (done?.id === ID.Tracks) header.tracksFound = true;
      else if (done?.id === ID.Seek) flushSeek();
    }
    const id = readId(buf, pos);
    if (id === null) break;
    const size = readSize(buf, pos + id.length);
    if (size === null) break;
    const dataStart = pos + id.length + size.length;
    const dataEnd = size.value === UNKNOWN_SIZE ? Number.MAX_SAFE_INTEGER : dataStart + size.value;

    if (id.value === ID.Cluster) {
      header.firstClusterPos = pos;
      break;
    }
    if (HEADER_MASTER.has(id.value)) {
      if (id.value === ID.Segment) {
        header.segmentDataStart = dataStart;
        if (size.value !== UNKNOWN_SIZE) header.segmentSize = size.value;
      }
      if (id.value === ID.TrackEntry) {
        draft = emptyTrack();
        languageIetf = null;
      }
      if (id.value === ID.Seek) {
        seekId = null;
        seekPos = null;
      }
      ends.push({ id: id.value, end: dataEnd });
      pos = dataStart;
      continue;
    }
    if (dataEnd > buf.length) break; // feuille tronquee
    const len = size.value;
    switch (id.value) {
      case ID.DocType:
        header.docType = readString(buf, dataStart, len);
        break;
      case ID.TimecodeScale:
        header.timecodeScale = readUint(buf, dataStart, len) || 1_000_000;
        break;
      case ID.Duration:
        rawDuration = readFloat(buf, dataStart, len);
        break;
      case ID.SeekID:
        seekId = buf.slice(dataStart, dataEnd);
        break;
      case ID.SeekPosition:
        seekPos = readUint(buf, dataStart, len);
        break;
      case ID.TrackNumber:
        if (draft) draft.number = readUint(buf, dataStart, len);
        break;
      case ID.TrackType:
        if (draft) draft.type = trackType(readUint(buf, dataStart, len));
        break;
      case ID.FlagDefault:
        if (draft) draft.isDefault = readUint(buf, dataStart, len) !== 0;
        break;
      case ID.DefaultDuration:
        if (draft) draft.defaultDurationNs = readUint(buf, dataStart, len);
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
        languageIetf = readString(buf, dataStart, len);
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
      case ID.OutputSamplingFrequency:
        if (draft) draft.outputSampleRate = readFloat(buf, dataStart, len);
        break;
      default:
        break;
    }
    pos = dataEnd;
  }
  if (draft !== null) flushTrack(); // tampon fini au milieu d'une piste : on garde ce qu'on a
  if (rawDuration !== null) header.durationSecs = (rawDuration * header.timecodeScale) / 1e9;
  return header;
}

/** Profil/niveau/bit depth depuis un HEVCDecoderConfigurationRecord (hvcC). */
export function parseHvcC(p: Uint8Array): { profile: number | null; level: number | null; bitDepth: number | null } {
  if (p.length < 23) return { profile: null, level: null, bitDepth: null };
  return { profile: (p[1] ?? 0) & 0x1f, level: p[12] ?? null, bitDepth: ((p[17] ?? 0) & 0x07) + 8 };
}

/** Profil/niveau depuis un AVCDecoderConfigurationRecord (avcC). */
export function parseAvcC(p: Uint8Array): { profile: number | null; level: number | null; bitDepth: number | null } {
  if (p.length < 4) return { profile: null, level: null, bitDepth: null };
  return { profile: p[1] ?? null, level: p[3] ?? null, bitDepth: 8 };
}

/** Vue anonymisee (diagnostic) d'un en-tete : aucune donnee binaire, aucun chemin. */
export function toSummary(h: MatroskaHeader): MatroskaSummary {
  return {
    docType: h.docType,
    segmentSize: h.segmentSize,
    durationSecs: h.durationSecs,
    tracksFound: h.tracksFound,
    video: h.tracks
      .filter((t) => t.type === 'video')
      .map((t) => {
        const extra =
          t.codecPrivate !== null && /HEVC/i.test(t.codecId)
            ? parseHvcC(t.codecPrivate)
            : t.codecPrivate !== null && /AVC/i.test(t.codecId)
              ? parseAvcC(t.codecPrivate)
              : { profile: null, level: null, bitDepth: null };
        return { codecId: t.codecId, width: t.width, height: t.height, ...extra };
      }),
    audio: h.tracks
      .filter((t) => t.type === 'audio')
      .map((t) => ({
        codecId: t.codecId,
        channels: t.channels,
        sampleRate: t.sampleRate,
        language: t.language,
        name: t.name,
        isDefault: t.isDefault,
      })),
    subtitles: h.tracks
      .filter((t) => t.type === 'subtitle')
      .map((t) => ({ codecId: t.codecId, language: t.language, name: t.name })),
  };
}

/**
 * Parse un element Cues (tampon commencant a l'ID 0x1C53BB6B). Renvoie les
 * points de seek du `trackNumber` demande (ou de n'importe quelle piste si
 * absent), tries par temps. `segmentDataStart` convertit les positions en
 * offsets absolus.
 */
export function parseCues(buf: Uint8Array, segmentDataStart: number, timecodeScale: number, trackNumber: number | null): CuePoint[] {
  const out: CuePoint[] = [];
  const id = readId(buf, 0);
  if (id === null || id.value !== ID.Cues) return out;
  const size = readSize(buf, id.length);
  if (size === null) return out;
  let pos = id.length + size.length;
  const end = size.value === UNKNOWN_SIZE ? buf.length : Math.min(buf.length, pos + size.value);
  while (pos < end) {
    const cid = readId(buf, pos);
    if (cid === null) break;
    const csize = readSize(buf, pos + cid.length);
    if (csize === null || csize.value === UNKNOWN_SIZE) break;
    const cStart = pos + cid.length + csize.length;
    const cEnd = cStart + csize.value;
    if (cEnd > buf.length) break;
    if (cid.value === ID.CuePoint) {
      let time: number | null = null;
      let clusterPos: number | null = null;
      let p = cStart;
      while (p < cEnd) {
        const eid = readId(buf, p);
        if (eid === null) break;
        const esize = readSize(buf, p + eid.length);
        if (esize === null || esize.value === UNKNOWN_SIZE) break;
        const eStart = p + eid.length + esize.length;
        const eEnd = eStart + esize.value;
        if (eid.value === ID.CueTime) time = readUint(buf, eStart, esize.value);
        else if (eid.value === ID.CueTrackPositions) {
          let track: number | null = null;
          let cpos: number | null = null;
          let q = eStart;
          while (q < eEnd) {
            const tid = readId(buf, q);
            if (tid === null) break;
            const tsize = readSize(buf, q + tid.length);
            if (tsize === null || tsize.value === UNKNOWN_SIZE) break;
            const tStart = q + tid.length + tsize.length;
            if (tid.value === ID.CueTrack) track = readUint(buf, tStart, tsize.value);
            else if (tid.value === ID.CueClusterPosition) cpos = readUint(buf, tStart, tsize.value);
            q = tStart + tsize.value;
          }
          if (cpos !== null && clusterPos === null && (trackNumber === null || track === null || track === trackNumber)) {
            clusterPos = cpos;
          }
        }
        p = eEnd;
      }
      if (time !== null && clusterPos !== null) {
        out.push({ timeMs: (time * timecodeScale) / 1e6, clusterPos: segmentDataStart + clusterPos });
      }
    }
    pos = cEnd;
  }
  out.sort((a, b) => a.timeMs - b.timeMs);
  return out;
}

/** Nombre de trames et tailles d'un bloc lace (Xiph / fixe / EBML). */
function laceSizes(data: Uint8Array, start: number, lacing: number, totalEnd: number): { sizes: number[]; dataStart: number } | null {
  const count = (data[start] ?? 0) + 1;
  let p = start + 1;
  const sizes: number[] = [];
  if (lacing === 1) {
    // Xiph : chaque taille = somme d'octets jusqu'a un octet < 255.
    for (let i = 0; i < count - 1; i += 1) {
      let s = 0;
      let b: number;
      do {
        b = data[p] ?? 0;
        p += 1;
        s += b;
      } while (b === 255 && p < totalEnd);
      sizes.push(s);
    }
  } else if (lacing === 3) {
    // EBML : 1re taille = vint, suivantes = deltas signes.
    const first = readSize(data, p);
    if (first === null) return null;
    sizes.push(first.value);
    p += first.length;
    for (let i = 1; i < count - 1; i += 1) {
      const d = readSize(data, p);
      if (d === null) return null;
      const bias = 2 ** (7 * d.length - 1) - 1;
      sizes.push((sizes[i - 1] ?? 0) + (d.value - bias));
      p += d.length;
    }
  } else if (lacing === 2) {
    const each = Math.floor((totalEnd - p) / count);
    for (let i = 0; i < count - 1; i += 1) sizes.push(each);
  }
  const used = sizes.reduce((a, b) => a + b, 0);
  sizes.push(totalEnd - p - used);
  if (sizes.some((s) => s < 0)) return null;
  return { sizes, dataStart: p };
}

/**
 * Lecture INCREMENTALE des Clusters : on lui pousse des morceaux du fichier
 * (a partir d'un Cluster) et il rend les blocs complets, dans l'ordre du
 * fichier (ordre de DECODAGE). Les elements inconnus/volumineux (Cues en fin
 * de fichier, Tags…) sont sautes, meme s'ils depassent le tampon courant.
 */
export class MatroskaClusterReader {
  private buf = new Uint8Array(0);
  private pos = 0;
  /** Octets restant a ignorer dans le flux (element saute plus grand que le tampon). */
  private skip = 0;
  private clusterTime = 0;
  /** Duree d'une trame lacee par piste (ms), pour horodater les trames d'un bloc lace. */
  private readonly laceDurationMs: Map<number, number>;

  constructor(
    private readonly timecodeScale: number,
    laceDurationMs: Map<number, number> = new Map(),
  ) {
    this.laceDurationMs = laceDurationMs;
  }

  reset(): void {
    this.buf = new Uint8Array(0);
    this.pos = 0;
    this.skip = 0;
    this.clusterTime = 0;
  }

  push(chunk: Uint8Array): MatroskaBlock[] {
    // Saut d'un element volumineux en cours.
    let c = chunk;
    if (this.skip > 0) {
      const take = Math.min(this.skip, c.length);
      this.skip -= take;
      c = c.subarray(take);
      if (c.length === 0) return [];
    }
    // Concatenation (compactage du prefixe consomme).
    const rest = this.buf.subarray(this.pos);
    const merged = new Uint8Array(rest.length + c.length);
    merged.set(rest, 0);
    merged.set(c, rest.length);
    this.buf = merged;
    this.pos = 0;

    const out: MatroskaBlock[] = [];
    const buf = this.buf;
    for (;;) {
      if (this.pos >= buf.length) break;
      const id = readId(buf, this.pos);
      if (id === null) {
        if ((buf[this.pos] ?? 1) === 0) {
          this.pos += 1; // octet nul : resynchronisation grossiere
          continue;
        }
        break; // ID incomplet : attendre
      }
      const size = readSize(buf, this.pos + id.length);
      if (size === null) break;
      const dataStart = this.pos + id.length + size.length;
      const unknown = size.value === UNKNOWN_SIZE;
      const dataEnd = unknown ? Number.MAX_SAFE_INTEGER : dataStart + size.value;

      if (id.value === ID.Cluster || (unknown && id.value !== ID.SimpleBlock && id.value !== ID.BlockGroup)) {
        // Cluster (ou maitre de taille inconnue) : on descend.
        this.pos = dataStart;
        continue;
      }
      if (id.value === ID.ClusterTimestamp || id.value === ID.SimpleBlock || id.value === ID.BlockGroup) {
        if (dataEnd > buf.length) break; // element incomplet : attendre
        if (id.value === ID.ClusterTimestamp) {
          this.clusterTime = readUint(buf, dataStart, size.value);
        } else if (id.value === ID.SimpleBlock) {
          this.parseBlock(buf, dataStart, dataEnd, null, out);
        } else {
          this.parseBlockGroup(buf, dataStart, dataEnd, out);
        }
        this.pos = dataEnd;
        continue;
      }
      // Autre element : on saute (eventuellement au-dela du tampon).
      if (dataEnd <= buf.length) {
        this.pos = dataEnd;
      } else {
        this.skip = dataEnd - buf.length;
        this.pos = buf.length;
      }
    }
    return out;
  }

  private parseBlockGroup(buf: Uint8Array, start: number, end: number, out: MatroskaBlock[]): void {
    let p = start;
    let block: { s: number; e: number } | null = null;
    let hasReference = false;
    while (p < end) {
      const id = readId(buf, p);
      if (id === null) break;
      const size = readSize(buf, p + id.length);
      if (size === null || size.value === UNKNOWN_SIZE) break;
      const s = p + id.length + size.length;
      const e = s + size.value;
      if (e > end) break;
      if (id.value === ID.Block) block = { s, e };
      else if (id.value === ID.ReferenceBlock) hasReference = true;
      p = e;
    }
    if (block !== null) this.parseBlock(buf, block.s, block.e, !hasReference, out);
  }

  /** `keyOverride` : BlockGroup (pas de drapeau keyframe dans le bloc). */
  private parseBlock(buf: Uint8Array, start: number, end: number, keyOverride: boolean | null, out: MatroskaBlock[]): void {
    const tn = readSize(buf, start);
    if (tn === null) return;
    let p = start + tn.length;
    if (p + 3 > end) return;
    const view = new DataView(buf.buffer, buf.byteOffset + p, 2);
    const relative = view.getInt16(0);
    const flags = buf[p + 2] ?? 0;
    p += 3;
    const keyframe = keyOverride ?? (flags & 0x80) !== 0;
    const lacing = (flags & 0x06) >> 1;
    const baseMs = ((this.clusterTime + relative) * this.timecodeScale) / 1e6;
    const trackNumber = tn.value;
    if (lacing === 0) {
      out.push({ trackNumber, timeMs: baseMs, keyframe, data: buf.slice(p, end) });
      return;
    }
    const laced = laceSizes(buf, p, lacing, end);
    if (laced === null) return;
    const step = this.laceDurationMs.get(trackNumber) ?? 0;
    let q = laced.dataStart;
    laced.sizes.forEach((sz, i) => {
      out.push({ trackNumber, timeMs: baseMs + i * step, keyframe, data: buf.slice(q, q + sz) });
      q += sz;
    });
  }
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
