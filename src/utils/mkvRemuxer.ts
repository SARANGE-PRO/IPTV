import type { MatroskaBlock, MatroskaHeader, MatroskaTrack, RemuxSegment } from '@/types/mkvDirect';
import { aacCodecString, buildAacLcConfig, parseAc3Frame, parseAudioSpecificConfig, parseEac3Frame, type AudioFrameInfo } from './audioCodecs';
import { ac3Entry, avc1Entry, buildInitSegment, buildMediaSegment, ec3Entry, hvc1Entry, mp4aEntry, type Fmp4Sample, type Fmp4Track } from './fmp4';
import { MatroskaClusterReader } from './matroska';

/*
 * Remuxeur MKV -> fMP4, PUR (aucun DOM) : on lui pousse les octets du fichier
 * a partir d'un Cluster, il rend des segments MP4 prets pour MediaSource.
 * Imports RELATIFS entre les briques du remux : elles doivent rester
 * executables hors Next (tests Node avec ffmpeg).
 *
 * Point delicat : Matroska ne stocke que des horodatages de PRESENTATION
 * (PTS), dans l'ordre de DECODAGE. Avec des B-frames, le PTS n'est pas
 * monotone alors que MP4 exige un DTS croissant. On derive le DTS comme ffmpeg
 * (tampon de PTS tries, profondeur = nombre max de trames reordonnees) et on
 * decale toute la timeline de `delay` trames pour que les DTS restent >= 0.
 */

const VIDEO_TIMESCALE = 90_000;
const SEGMENT_TARGET_MS = 1000;
/** Trames video analysees avant de fixer la profondeur de reordonnancement. */
const ANALYSIS_FRAMES = 24;
const DEFAULT_FRAME_MS = 1000 / 25;

export interface MseTypeSupport {
  isTypeSupported(mime: string): boolean;
}

export interface TrackSelection {
  video: MatroskaTrack;
  audio: MatroskaTrack | null;
}

/** `avc1.PPCCLL` depuis l'avcC. */
export function avcCodecString(avcC: Uint8Array): string {
  const hex = (n: number) => n.toString(16).padStart(2, '0');
  return `avc1.${hex(avcC[1] ?? 0x64)}${hex(avcC[2] ?? 0)}${hex(avcC[3] ?? 0x28)}`;
}

/** `hvc1.P.C.LT.CC…` depuis l'hvcC (forme acceptee par Safari / Chrome). */
export function hevcCodecString(hvcC: Uint8Array): string {
  const b1 = hvcC[1] ?? 0x01;
  const profileSpace = b1 >> 6;
  const tier = (b1 >> 5) & 1;
  const profile = b1 & 0x1f;
  let compat = 0;
  for (let i = 0; i < 4; i += 1) compat = (compat << 8) | (hvcC[2 + i] ?? 0);
  // Les drapeaux de compatibilite sont ecrits bit-inverses dans la chaine.
  let reversed = 0;
  for (let i = 0; i < 32; i += 1) reversed = (reversed << 1) | ((compat >>> i) & 1);
  const level = hvcC[12] ?? 0;
  const constraint = Array.from(hvcC.subarray(6, 12))
    .map((b) => b.toString(16).toUpperCase())
    .join('.')
    .replace(/(\.0)+$/, '');
  const space = ['', 'A', 'B', 'C'][profileSpace] ?? '';
  return `hvc1.${space}${profile}.${(reversed >>> 0).toString(16).toUpperCase()}.${tier ? 'H' : 'L'}${level}.${constraint || '0'}`;
}

function videoMime(t: MatroskaTrack): string | null {
  const c = t.codecId.toUpperCase();
  if (t.codecPrivate === null) return null;
  if (c.startsWith('V_MPEG4/ISO/AVC')) return `video/mp4; codecs="${avcCodecString(t.codecPrivate)}"`;
  if (c.startsWith('V_MPEGH/ISO/HEVC')) return `video/mp4; codecs="${hevcCodecString(t.codecPrivate)}"`;
  return null;
}

function audioMime(t: MatroskaTrack): string | null {
  const c = t.codecId.toUpperCase();
  if (c.startsWith('A_AAC')) return `audio/mp4; codecs="${aacCodecString(t.codecPrivate)}"`;
  if (c === 'A_AC3' || c.startsWith('A_AC3/')) return 'audio/mp4; codecs="ac-3"';
  if (c === 'A_EAC3') return 'audio/mp4; codecs="ec-3"';
  return null;
}

function langScore(t: MatroskaTrack, preferred: string): number {
  const lang = (t.language ?? '').toLowerCase();
  const name = (t.name ?? '').toLowerCase();
  const isFr = /^fr/.test(lang) || /\bvff?\b|\bvf\b|fran/.test(name);
  const isEn = /^en/.test(lang) || /\bvo\b|engl/.test(name);
  let score = 0;
  if (preferred === 'VF' && isFr) score += 10;
  if (preferred === 'VO' && (isEn || (!isFr && lang !== '' && lang !== 'und'))) score += 10;
  if (t.isDefault) score += 1;
  return score;
}

/**
 * Choisit la piste video (1re decodable) et la piste audio (langue preferee,
 * puis piste par defaut, puis premiere decodable). Renvoie une erreur typee si
 * rien n'est lisible.
 */
export function selectTracks(
  header: MatroskaHeader,
  mse: MseTypeSupport,
  preferredLanguage: string,
): { ok: true; selection: TrackSelection; videoMime: string; audioMime: string | null } | { ok: false; error: 'no_video' | 'unsupported_video' | 'unsupported_audio' } {
  const videos = header.tracks.filter((t) => t.type === 'video');
  if (videos.length === 0) return { ok: false, error: 'no_video' };
  let video: MatroskaTrack | null = null;
  let vMime: string | null = null;
  for (const v of videos) {
    const m = videoMime(v);
    if (m !== null && mse.isTypeSupported(m)) {
      video = v;
      vMime = m;
      break;
    }
  }
  if (video === null || vMime === null) return { ok: false, error: 'unsupported_video' };

  const audios = header.tracks
    .filter((t) => t.type === 'audio')
    .map((t) => ({ t, mime: audioMime(t) }))
    .filter((x): x is { t: MatroskaTrack; mime: string } => x.mime !== null && mse.isTypeSupported(x.mime))
    .sort((a, b) => langScore(b.t, preferredLanguage) - langScore(a.t, preferredLanguage));
  const hasAnyAudio = header.tracks.some((t) => t.type === 'audio');
  const audio = audios[0] ?? null;
  if (hasAnyAudio && audio === null) return { ok: false, error: 'unsupported_audio' };
  return { ok: true, selection: { video, audio: audio?.t ?? null }, videoMime: vMime, audioMime: audio?.mime ?? null };
}

interface PendingSample {
  ptsMs: number;
  dtsMs: number;
  keyframe: boolean;
  data: Uint8Array;
}

/** Etat de mux d'une piste : lookahead d'un echantillon pour connaitre sa duree. */
class TrackMuxer {
  private pending: PendingSample[] = [];
  private lookahead: PendingSample | null = null;
  private sequence = 1;
  constructor(
    readonly track: Fmp4Track,
    readonly kind: 'video' | 'audio',
    private readonly fallbackDurationMs: number,
  ) {}

  reset(): void {
    this.pending = [];
    this.lookahead = null;
  }

  /** Ajoute un echantillon (DTS deja monotone). Rend un segment si la rafale est assez longue. */
  push(s: PendingSample): RemuxSegment | null {
    if (this.lookahead !== null) this.pending.push(this.lookahead);
    this.lookahead = s;
    const first = this.pending[0];
    if (first !== undefined && s.dtsMs - first.dtsMs >= SEGMENT_TARGET_MS) return this.emit(false);
    return null;
  }

  /** Vide ce qui reste (fin de flux / avant un seek). */
  flush(): RemuxSegment | null {
    if (this.lookahead !== null) this.pending.push(this.lookahead);
    this.lookahead = null;
    return this.pending.length > 0 ? this.emit(true) : null;
  }

  private emit(final: boolean): RemuxSegment | null {
    const batch = this.pending;
    this.pending = [];
    if (batch.length === 0) return null;
    const ts = this.track.timescale;
    const toUnits = (ms: number) => Math.round((ms * ts) / 1000);
    const samples: Fmp4Sample[] = batch.map((b, i) => {
      const next = batch[i + 1] ?? (final ? null : this.lookahead);
      const durMs = next !== null && next !== undefined ? next.dtsMs - b.dtsMs : this.fallbackDurationMs;
      return {
        data: b.data,
        duration: Math.max(1, toUnits(durMs)),
        cts: Math.max(0, toUnits(b.ptsMs - b.dtsMs)),
        keyframe: this.kind === 'audio' ? true : b.keyframe,
      };
    });
    const first = batch[0];
    const last = batch[batch.length - 1];
    if (first === undefined || last === undefined) return null;
    const data = buildMediaSegment(this.track, this.sequence, toUnits(first.dtsMs), samples);
    this.sequence += 1;
    return {
      track: this.kind,
      data,
      startMs: Math.min(...batch.map((b) => b.ptsMs)),
      endMs: Math.max(...batch.map((b) => b.ptsMs)) + this.fallbackDurationMs,
    };
  }
}

/** Derivation DTS facon ffmpeg : tampon de `delay + 1` PTS tries. */
class DtsDeriver {
  private buffer: number[] = [];
  private count = 0;
  private firstPts: number | null = null;
  constructor(
    readonly delay: number,
    readonly frameMs: number,
  ) {}

  reset(): void {
    this.buffer = [];
    this.count = 0;
    this.firstPts = null;
  }

  next(pts: number): number {
    if (this.firstPts === null) this.firstPts = pts;
    this.buffer.push(pts);
    this.buffer.sort((a, b) => a - b);
    const n = this.count;
    this.count += 1;
    if (this.buffer.length > this.delay) {
      return this.buffer.shift() ?? pts;
    }
    return this.firstPts - (this.delay - n) * this.frameMs;
  }
}

export interface RemuxerInfo {
  videoCodec: string;
  audioCodec: string | null;
  reorderDelay: number;
  frameMs: number;
  /** Decalage applique a toute la timeline (ms) pour garder des DTS >= 0. */
  timeOffsetMs: number;
}

/**
 * Remuxeur complet : `pushBytes` (octets a partir d'un Cluster) -> segments.
 * Les segments d'initialisation sont disponibles immediatement pour la video ;
 * pour AC-3/E-AC-3 ils exigent la 1re trame audio (en-tete dac3/dec3), d'ou
 * `onAudioInit` appele des que possible.
 */
export class MkvRemuxer {
  readonly videoMime: string;
  readonly audioMime: string | null;
  private readonly reader: MatroskaClusterReader;
  private readonly video: MatroskaTrack;
  private readonly audio: MatroskaTrack | null;
  private videoMux: TrackMuxer | null = null;
  private audioMux: TrackMuxer | null = null;
  private audioInfo: AudioFrameInfo | null = null;
  private audioInitSent = false;
  private dts: DtsDeriver | null = null;
  private analysis: MatroskaBlock[] = [];
  private videoFrameMs: number;
  private audioFrameMs: number | null = null;
  private timeOffsetMs = 0;
  private audioPending: MatroskaBlock[] = [];

  constructor(
    header: MatroskaHeader,
    selection: TrackSelection,
    mimes: { videoMime: string; audioMime: string | null },
    private readonly onAudioInit: (init: Uint8Array) => void,
  ) {
    this.video = selection.video;
    this.audio = selection.audio;
    this.videoMime = mimes.videoMime;
    this.audioMime = mimes.audioMime;
    this.videoFrameMs = this.video.defaultDurationNs !== null ? this.video.defaultDurationNs / 1e6 : DEFAULT_FRAME_MS;
    const lace = new Map<number, number>();
    if (this.audio !== null) {
      const sr = this.audio.sampleRate ?? 48000;
      const c = this.audio.codecId.toUpperCase();
      const samples = c.startsWith('A_AAC') ? 1024 : 1536;
      this.audioFrameMs = (samples / sr) * 1000;
      lace.set(this.audio.number, this.audioFrameMs);
    }
    this.reader = new MatroskaClusterReader(header.timecodeScale, lace);
  }

  /** Segment d'initialisation video (toujours disponible). */
  videoInitSegment(): Uint8Array {
    const t = this.videoTrack();
    return buildInitSegment(t);
  }

  info(): RemuxerInfo {
    return {
      videoCodec: this.videoMime,
      audioCodec: this.audioMime,
      reorderDelay: this.dts?.delay ?? 0,
      frameMs: this.videoFrameMs,
      timeOffsetMs: this.timeOffsetMs,
    };
  }

  /** A appeler avant de reprendre a une autre position (seek). */
  reset(): void {
    this.reader.reset();
    this.videoMux?.reset();
    this.audioMux?.reset();
    this.dts?.reset();
    this.analysis = [];
    this.audioPending = [];
  }

  pushBytes(chunk: Uint8Array): RemuxSegment[] {
    const out: RemuxSegment[] = [];
    for (const block of this.reader.push(chunk)) this.handleBlock(block, out);
    return out;
  }

  /** Fin de flux : vide les tampons. */
  flush(): RemuxSegment[] {
    const out: RemuxSegment[] = [];
    if (this.dts === null && this.analysis.length > 0) this.finishAnalysis(out);
    const v = this.videoMux?.flush();
    if (v) out.push(v);
    const a = this.audioMux?.flush();
    if (a) out.push(a);
    return out;
  }

  private videoTrack(): Fmp4Track {
    const priv = this.video.codecPrivate ?? new Uint8Array(0);
    const w = this.video.width ?? 1920;
    const h = this.video.height ?? 1080;
    const entry = this.video.codecId.toUpperCase().startsWith('V_MPEGH') ? hvc1Entry(w, h, priv) : avc1Entry(w, h, priv);
    return { id: 1, kind: 'video', timescale: VIDEO_TIMESCALE, sampleEntry: entry, width: w, height: h, duration: 0 };
  }

  private ensureAudioMux(firstFrame: Uint8Array): boolean {
    if (this.audioMux !== null || this.audio === null) return this.audioMux !== null;
    const c = this.audio.codecId.toUpperCase();
    const sr = this.audio.sampleRate ?? 48000;
    const ch = this.audio.channels ?? 2;
    let entry: Uint8Array;
    let info: AudioFrameInfo;
    if (c.startsWith('A_AAC')) {
      const asc = this.audio.codecPrivate ?? buildAacLcConfig(sr, ch);
      const parsed = parseAudioSpecificConfig(asc);
      info = { sampleRate: parsed?.sampleRate ?? sr, channels: parsed?.channels ?? ch, frameSamples: 1024, config: asc };
      entry = mp4aEntry(info.channels, info.sampleRate, asc);
    } else if (c === 'A_EAC3') {
      const p = parseEac3Frame(firstFrame);
      if (p === null) return false;
      info = p;
      entry = ec3Entry(p.channels, p.sampleRate, p.config);
    } else {
      const p = parseAc3Frame(firstFrame);
      if (p === null) return false;
      info = p;
      entry = ac3Entry(p.channels, p.sampleRate, p.config);
    }
    this.audioInfo = info;
    this.audioFrameMs = (info.frameSamples / info.sampleRate) * 1000;
    const track: Fmp4Track = { id: 2, kind: 'audio', timescale: info.sampleRate, sampleEntry: entry, width: 0, height: 0, duration: 0 };
    this.audioMux = new TrackMuxer(track, 'audio', this.audioFrameMs);
    if (!this.audioInitSent) {
      this.audioInitSent = true;
      this.onAudioInit(buildInitSegment(track));
    }
    return true;
  }

  private handleBlock(b: MatroskaBlock, out: RemuxSegment[]): void {
    if (b.trackNumber === this.video.number) {
      if (this.dts === null) {
        this.analysis.push(b);
        if (this.analysis.length >= ANALYSIS_FRAMES) this.finishAnalysis(out);
        return;
      }
      this.pushVideo(b, out);
      return;
    }
    if (this.audio !== null && b.trackNumber === this.audio.number) {
      if (this.dts === null) {
        // L'offset de timeline n'est connu qu'apres l'analyse video : on retient.
        this.audioPending.push(b);
        return;
      }
      this.pushAudio(b, out);
    }
  }

  /** Fixe la profondeur de reordonnancement et la duree de trame, puis rejoue l'analyse. */
  private finishAnalysis(out: RemuxSegment[]): void {
    const frames = this.analysis;
    this.analysis = [];
    const pts = frames.map((f) => f.timeMs);
    const sorted = [...pts].sort((a, b) => a - b);
    if (this.video.defaultDurationNs === null && sorted.length >= 3) {
      const diffs: number[] = [];
      for (let i = 1; i < sorted.length; i += 1) diffs.push((sorted[i] ?? 0) - (sorted[i - 1] ?? 0));
      diffs.sort((a, b) => a - b);
      const median = diffs[Math.floor(diffs.length / 2)] ?? DEFAULT_FRAME_MS;
      if (median > 1 && median < 200) this.videoFrameMs = median;
    }
    let delay = 0;
    pts.forEach((p, i) => {
      const rank = sorted.indexOf(p);
      if (i - rank > delay) delay = i - rank;
    });
    delay = Math.min(delay + 1, 8); // marge d'une trame, borne raisonnable
    this.dts = new DtsDeriver(delay, this.videoFrameMs);
    this.timeOffsetMs = delay * this.videoFrameMs;
    this.videoMux = new TrackMuxer(this.videoTrack(), 'video', this.videoFrameMs);
    for (const f of frames) this.pushVideo(f, out);
    const pendingAudio = this.audioPending;
    this.audioPending = [];
    for (const a of pendingAudio) this.pushAudio(a, out);
  }

  private pushVideo(b: MatroskaBlock, out: RemuxSegment[]): void {
    if (this.dts === null || this.videoMux === null) return;
    const pts = b.timeMs + this.timeOffsetMs;
    const dts = this.dts.next(pts);
    const seg = this.videoMux.push({ ptsMs: pts, dtsMs: dts, keyframe: b.keyframe, data: b.data });
    if (seg) out.push(seg);
  }

  private pushAudio(b: MatroskaBlock, out: RemuxSegment[]): void {
    if (!this.ensureAudioMux(b.data) || this.audioMux === null) return;
    const pts = b.timeMs + this.timeOffsetMs;
    const seg = this.audioMux.push({ ptsMs: pts, dtsMs: pts, keyframe: true, data: b.data });
    if (seg) out.push(seg);
  }

  /** Infos audio (apres la 1re trame) : utile au diagnostic. */
  audioDetails(): AudioFrameInfo | null {
    return this.audioInfo;
  }
}
