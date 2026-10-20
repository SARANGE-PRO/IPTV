/**
 * Muxeur MP4 fragmente (ISO BMFF) minimal, PUR : segment d'initialisation
 * (ftyp + moov) et segments media (moof + mdat), une piste par SourceBuffer.
 * Les echantillons arrivent deja « au format MP4 » (NAL prefixes par leur
 * longueur pour H.264/HEVC, trames AAC/AC-3 brutes) : aucun transcodage.
 */

export interface Fmp4Track {
  id: number;
  kind: 'video' | 'audio';
  /** Unites de temps par seconde (video : 90 000 ; audio : frequence d'echantillonnage). */
  timescale: number;
  /** Boite d'entree d'echantillon complete (avc1 / hvc1 / mp4a / ac-3 / ec-3). */
  sampleEntry: Uint8Array;
  width: number;
  height: number;
  /** Duree totale en unites `timescale` (0 si inconnue : MediaSource.duration fait foi). */
  duration: number;
}

export interface Fmp4Sample {
  data: Uint8Array;
  /** Duree en unites `timescale`. */
  duration: number;
  /** Decalage composition (pts - dts) en unites `timescale`, >= 0. */
  cts: number;
  keyframe: boolean;
}

const enc = new TextEncoder();

function u16(v: number): number[] {
  return [(v >> 8) & 0xff, v & 0xff];
}
function u32(v: number): number[] {
  return [(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff];
}
function u64(v: number): number[] {
  const hi = Math.floor(v / 4294967296);
  const lo = v >>> 0;
  return [...u32(hi), ...u32(lo)];
}
function str(s: string): number[] {
  return Array.from(enc.encode(s));
}

function concat(parts: (Uint8Array | number[])[]): Uint8Array {
  const arrays = parts.map((p) => (p instanceof Uint8Array ? p : Uint8Array.from(p)));
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrays) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}

export function box(type: string, ...payload: (Uint8Array | number[])[]): Uint8Array {
  const body = concat(payload);
  return concat([u32(8 + body.length), str(type), body]);
}

function fullBox(type: string, version: number, flags: number, ...payload: (Uint8Array | number[])[]): Uint8Array {
  return box(type, [version, (flags >> 16) & 0xff, (flags >> 8) & 0xff, flags & 0xff], ...payload);
}

// --- Entrees d'echantillon -------------------------------------------------

function visualSampleEntry(type: string, width: number, height: number, config: Uint8Array): Uint8Array {
  return box(
    type,
    [0, 0, 0, 0, 0, 0, ...u16(1)], // reserved(6) + data_reference_index
    [...u16(0), ...u16(0), ...u32(0), ...u32(0), ...u32(0)], // pre_defined / reserved
    [...u16(width), ...u16(height)],
    [...u32(0x00480000), ...u32(0x00480000)], // 72 dpi
    u32(0),
    u16(1), // frame_count
    new Array(32).fill(0), // compressorname
    u16(0x0018), // depth
    u16(0xffff), // pre_defined = -1
    config,
  );
}

/** `avc1` + `avcC` (CodecPrivate Matroska = AVCDecoderConfigurationRecord). */
export function avc1Entry(width: number, height: number, avcC: Uint8Array): Uint8Array {
  return visualSampleEntry('avc1', width, height, box('avcC', avcC));
}

/** `hvc1` + `hvcC` (Safari exige hvc1, parametres dans hvcC). */
export function hvc1Entry(width: number, height: number, hvcC: Uint8Array): Uint8Array {
  return visualSampleEntry('hvc1', width, height, box('hvcC', hvcC));
}

function audioSampleEntry(type: string, channels: number, sampleRate: number, config: Uint8Array): Uint8Array {
  return box(
    type,
    [0, 0, 0, 0, 0, 0, ...u16(1)],
    [...u32(0), ...u32(0)], // reserved
    u16(channels),
    u16(16), // samplesize
    u16(0), // pre_defined
    u16(0), // reserved
    [...u16(sampleRate & 0xffff), ...u16(0)], // samplerate << 16
    config,
  );
}

/** `mp4a` + `esds` autour de l'AudioSpecificConfig. */
export function mp4aEntry(channels: number, sampleRate: number, asc: Uint8Array): Uint8Array {
  const dsi = [0x05, asc.length, ...asc]; // DecoderSpecificInfo
  const dcd = [
    0x04,
    13 + dsi.length,
    0x40, // objectTypeIndication : MPEG-4 audio
    0x15, // streamType audio (5) << 2 | reserved 1
    0x00, 0x00, 0x00, // bufferSizeDB
    ...u32(0), // maxBitrate
    ...u32(0), // avgBitrate
    ...dsi,
  ];
  const sl = [0x06, 0x01, 0x02];
  const es = [0x03, 3 + dcd.length + sl.length, ...u16(1), 0x00, ...dcd, ...sl];
  return audioSampleEntry('mp4a', channels, sampleRate, fullBox('esds', 0, 0, es));
}

/** `ac-3` + `dac3`. */
export function ac3Entry(channels: number, sampleRate: number, dac3: Uint8Array): Uint8Array {
  return audioSampleEntry('ac-3', channels, sampleRate, box('dac3', dac3));
}

/** `ec-3` + `dec3`. */
export function ec3Entry(channels: number, sampleRate: number, dec3: Uint8Array): Uint8Array {
  return audioSampleEntry('ec-3', channels, sampleRate, box('dec3', dec3));
}

// --- Segment d'initialisation ------------------------------------------------

function trak(t: Fmp4Track): Uint8Array {
  const isVideo = t.kind === 'video';
  const tkhd = fullBox(
    'tkhd',
    0,
    0x000007,
    u32(0), // creation
    u32(0), // modification
    u32(t.id),
    u32(0), // reserved
    u32(0), // duration (0 : inconnue)
    [...u32(0), ...u32(0)], // reserved
    u16(0), // layer
    u16(isVideo ? 0 : 1), // alternate_group
    u16(isVideo ? 0 : 0x0100), // volume
    u16(0), // reserved
    [...u32(0x00010000), ...u32(0), ...u32(0), ...u32(0), ...u32(0x00010000), ...u32(0), ...u32(0), ...u32(0), ...u32(0x40000000)],
    u32(isVideo ? t.width << 16 : 0),
    u32(isVideo ? t.height << 16 : 0),
  );
  const mdhd = fullBox('mdhd', 0, 0, u32(0), u32(0), u32(t.timescale), u32(0), u16(0x55c4) /* 'und' */, u16(0));
  const hdlr = fullBox(
    'hdlr',
    0,
    0,
    u32(0),
    str(isVideo ? 'vide' : 'soun'),
    [...u32(0), ...u32(0), ...u32(0)],
    str(isVideo ? 'VideoHandler' : 'SoundHandler'),
    [0],
  );
  const mhd = isVideo ? fullBox('vmhd', 0, 1, [...u16(0), ...u16(0), ...u16(0), ...u16(0)]) : fullBox('smhd', 0, 0, [...u16(0), ...u16(0)]);
  const dinf = box('dinf', fullBox('dref', 0, 0, u32(1), fullBox('url ', 0, 1)));
  const stbl = box(
    'stbl',
    fullBox('stsd', 0, 0, u32(1), t.sampleEntry),
    fullBox('stts', 0, 0, u32(0)),
    fullBox('stsc', 0, 0, u32(0)),
    fullBox('stsz', 0, 0, u32(0), u32(0)),
    fullBox('stco', 0, 0, u32(0)),
  );
  const minf = box('minf', mhd, dinf, stbl);
  const mdia = box('mdia', mdhd, hdlr, minf);
  return box('trak', tkhd, mdia);
}

/** ftyp + moov pour UNE piste (un SourceBuffer par piste). */
export function buildInitSegment(t: Fmp4Track): Uint8Array {
  const ftyp = box('ftyp', str('isom'), u32(1), str('isom'), str('iso5'), str('avc1'), str('mp41'));
  const mvhd = fullBox(
    'mvhd',
    0,
    0,
    u32(0),
    u32(0),
    u32(1000), // timescale
    u32(0), // duration inconnue
    u32(0x00010000), // rate
    u16(0x0100), // volume
    u16(0),
    [...u32(0), ...u32(0)],
    [...u32(0x00010000), ...u32(0), ...u32(0), ...u32(0), ...u32(0x00010000), ...u32(0), ...u32(0), ...u32(0), ...u32(0x40000000)],
    new Array(24).fill(0), // pre_defined
    u32(t.id + 1), // next_track_ID
  );
  const trex = fullBox('trex', 0, 0, u32(t.id), u32(1), u32(0), u32(0), u32(0x00010001));
  const moov = box('moov', mvhd, trak(t), box('mvex', trex));
  return concat([ftyp, moov]);
}

// --- Segment media -----------------------------------------------------------

const FLAG_KEY = 0x02000000; // depends_on = 2 (ne depend de rien), non_sync = 0
const FLAG_NON_KEY = 0x01010000; // depends_on = 1, is_non_sync_sample = 1

/** moof + mdat pour une rafale d'echantillons d'UNE piste. */
export function buildMediaSegment(t: Fmp4Track, sequence: number, baseDecodeTime: number, samples: Fmp4Sample[]): Uint8Array {
  const mfhd = fullBox('mfhd', 0, 0, u32(sequence));
  const tfhd = fullBox('tfhd', 0, 0x020000 /* default-base-is-moof */, u32(t.id));
  const tfdt = fullBox('tfdt', 1, 0, u64(baseDecodeTime));
  const trunRows: number[] = [];
  for (const s of samples) {
    trunRows.push(...u32(s.duration), ...u32(s.data.length), ...u32(s.keyframe ? FLAG_KEY : FLAG_NON_KEY), ...u32(s.cts));
  }
  // trun v1 (cts signe), drapeaux : data-offset | duration | size | flags | cts
  const trunNoOffset = fullBox('trun', 1, 0x000f01, u32(samples.length), u32(0), trunRows);
  const trafSize = 8 + tfhd.length + tfdt.length + trunNoOffset.length;
  const moofSize = 8 + mfhd.length + trafSize;
  const dataOffset = moofSize + 8; // premier octet apres l'en-tete du mdat
  const trun = fullBox('trun', 1, 0x000f01, u32(samples.length), u32(dataOffset), trunRows);
  const moof = box('moof', mfhd, box('traf', tfhd, tfdt, trun));
  const mdat = box('mdat', ...samples.map((s) => s.data));
  return concat([moof, mdat]);
}
