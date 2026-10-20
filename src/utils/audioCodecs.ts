/**
 * En-tetes des codecs audio pris en charge par le remux MKV -> fMP4, pour
 * construire les boites de description MP4 (esds / dac3 / dec3). Pur, sans I/O.
 */

export interface AudioFrameInfo {
  sampleRate: number;
  channels: number;
  /** Echantillons par trame (duree = frameSamples / sampleRate). */
  frameSamples: number;
  /** Charge utile de la boite de description (dac3, dec3 ou AudioSpecificConfig). */
  config: Uint8Array;
}

class BitReader {
  private bit = 0;
  constructor(private readonly b: Uint8Array) {}
  read(n: number): number {
    let v = 0;
    for (let i = 0; i < n; i += 1) {
      const byte = this.b[this.bit >> 3] ?? 0;
      const bitVal = (byte >> (7 - (this.bit & 7))) & 1;
      v = v * 2 + bitVal;
      this.bit += 1;
    }
    return v;
  }
  skip(n: number): void {
    this.bit += n;
  }
}

class BitWriter {
  private bits: number[] = [];
  write(value: number, n: number): this {
    for (let i = n - 1; i >= 0; i -= 1) this.bits.push((value >> i) & 1);
    return this;
  }
  bytes(): Uint8Array {
    const out = new Uint8Array(Math.ceil(this.bits.length / 8));
    this.bits.forEach((b, i) => {
      out[i >> 3] = (out[i >> 3] ?? 0) | (b << (7 - (i & 7)));
    });
    return out;
  }
}

const AC3_SAMPLE_RATES = [48000, 44100, 32000];
const AC3_CHANNELS = [2, 1, 2, 3, 3, 4, 4, 5]; // par acmod
const EAC3_SR2 = [24000, 22050, 16000];
const EAC3_BLOCKS = [1, 2, 3, 6];

/** AC-3 (A/52) : lit le syncframe pour fabriquer `dac3`. */
export function parseAc3Frame(frame: Uint8Array): AudioFrameInfo | null {
  if (frame.length < 7 || frame[0] !== 0x0b || frame[1] !== 0x77) return null;
  const r = new BitReader(frame.subarray(4));
  const fscod = r.read(2);
  const frmsizecod = r.read(6);
  const bsid = r.read(5);
  const bsmod = r.read(3);
  const acmod = r.read(3);
  if (acmod !== 1 && (acmod & 1) !== 0) r.skip(2); // cmixlev
  if (acmod !== 1 && (acmod & 4) !== 0) r.skip(2); // surmixlev
  if (acmod === 2) r.skip(2); // dsurmod
  const lfeon = r.read(1);
  const sampleRate = AC3_SAMPLE_RATES[fscod];
  if (sampleRate === undefined || bsid > 8) return null;
  const dac3 = new BitWriter()
    .write(fscod, 2)
    .write(bsid, 5)
    .write(bsmod, 3)
    .write(acmod, 3)
    .write(lfeon, 1)
    .write(frmsizecod >> 1, 5)
    .write(0, 5)
    .bytes();
  return { sampleRate, channels: (AC3_CHANNELS[acmod] ?? 2) + lfeon, frameSamples: 1536, config: dac3 };
}

/** E-AC-3 (A/52 annexe E) : lit le syncframe du flux independant 0 pour fabriquer `dec3`. */
export function parseEac3Frame(frame: Uint8Array): AudioFrameInfo | null {
  if (frame.length < 6 || frame[0] !== 0x0b || frame[1] !== 0x77) return null;
  const r = new BitReader(frame.subarray(2));
  const strmtyp = r.read(2);
  r.skip(3); // substreamid
  const frmsiz = r.read(11);
  const fscod = r.read(2);
  let numblks: number;
  let sampleRate: number | undefined;
  if (fscod === 3) {
    const fscod2 = r.read(2);
    sampleRate = EAC3_SR2[fscod2];
    numblks = 6;
  } else {
    const numblkscod = r.read(2);
    sampleRate = AC3_SAMPLE_RATES[fscod];
    numblks = EAC3_BLOCKS[numblkscod] ?? 6;
  }
  const acmod = r.read(3);
  const lfeon = r.read(1);
  const bsid = r.read(5);
  if (sampleRate === undefined || bsid !== 16 || strmtyp === 1) return null;
  const frameBytes = (frmsiz + 1) * 2;
  const frameSamples = numblks * 256;
  const dataRate = Math.round((frameBytes * 8 * sampleRate) / frameSamples / 1000);
  const dec3 = new BitWriter()
    .write(dataRate, 13)
    .write(0, 3) // num_ind_sub - 1
    .write(fscod, 2)
    .write(bsid, 5)
    .write(0, 1) // reserved
    .write(0, 1) // asvc
    .write(0, 3) // bsmod
    .write(acmod, 3)
    .write(lfeon, 1)
    .write(0, 3) // reserved
    .write(0, 4) // num_dep_sub
    .write(0, 1) // reserved
    .bytes();
  return { sampleRate, channels: (AC3_CHANNELS[acmod] ?? 2) + lfeon, frameSamples, config: dec3 };
}

const AAC_SAMPLE_RATES = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];

/** Lit un AudioSpecificConfig (CodecPrivate AAC) : type d'objet, frequence, canaux. */
export function parseAudioSpecificConfig(asc: Uint8Array): { objectType: number; sampleRate: number | null; channels: number | null } | null {
  if (asc.length < 2) return null;
  const r = new BitReader(asc);
  let objectType = r.read(5);
  if (objectType === 31) objectType = 32 + r.read(6);
  const srIndex = r.read(4);
  const sampleRate = srIndex === 15 ? r.read(24) : (AAC_SAMPLE_RATES[srIndex] ?? null);
  const chanConfig = r.read(4);
  const channels = chanConfig === 0 ? null : chanConfig === 7 ? 8 : chanConfig;
  return { objectType, sampleRate, channels };
}

/** Fabrique un AudioSpecificConfig AAC-LC si le fichier n'en fournit pas. */
export function buildAacLcConfig(sampleRate: number, channels: number): Uint8Array {
  let srIndex = AAC_SAMPLE_RATES.indexOf(sampleRate);
  if (srIndex < 0) srIndex = 3; // 48 kHz
  const chanConfig = channels === 8 ? 7 : Math.min(channels, 6);
  return new BitWriter().write(2, 5).write(srIndex, 4).write(chanConfig, 4).write(0, 3).bytes();
}

/** Chaine `codecs=` MSE pour une piste AAC d'apres son AudioSpecificConfig. */
export function aacCodecString(asc: Uint8Array | null): string {
  const parsed = asc !== null ? parseAudioSpecificConfig(asc) : null;
  const ot = parsed?.objectType ?? 2;
  return `mp4a.40.${ot}`;
}
