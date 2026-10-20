import type { CuePoint, MatroskaHeader, MkvDirectErrorCode, RemuxSegment } from '@/types/mkvDirect';
import { parseCues, parseMatroskaHeader, readId, readSize } from '@/utils/matroska';
import { MkvRemuxer, selectTracks } from '@/utils/mkvRemuxer';

/**
 * Moteur de lecture DIRECTE d'un MKV (coquille HTTP, sans passerelle) :
 * fetch du fichier depuis l'appareil (IP du client), demux + remux en fMP4
 * (utils/mkvRemuxer, pur) et alimentation de MediaSource / ManagedMediaSource
 * (iPhone iOS 17.1+). Seek via les Cues du fichier (requetes Range).
 *
 * Invariants : URL directe Xtream uniquement (jamais Vercel ni passerelle) ;
 * aucune URL ni identifiant dans les erreurs remontees (`detail` = codes/statuts).
 */

export interface MkvDirectEngineOptions {
  url: string;
  /** 'VF' | 'VO' (reglage utilisateur) : choix de la piste audio. */
  preferredLanguage: string;
  onFatal: (code: MkvDirectErrorCode, detail: string) => void;
}

const HEADER_BYTES = 4 << 20;
const HEADER_BYTES_MAX = 16 << 20;
const CUES_PROBE_BYTES = 64 << 10;
const FETCH_TIMEOUT_MS = 20_000;
/** On cesse de lire quand le tampon depasse la position de lecture de cette marge. */
const AHEAD_TARGET_S = 40;
/** Donnees conservees derriere la tete de lecture avant purge. */
const BACK_BUFFER_S = 30;
const RECONNECT_MAX = 3;

interface MseLike extends EventTarget {
  readyState: string;
  duration: number;
  streaming?: boolean;
  addSourceBuffer(mime: string): SourceBuffer;
  endOfStream(): void;
}
interface MseCtor {
  new (): MseLike;
  isTypeSupported(mime: string): boolean;
}

function mseCtor(): MseCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { ManagedMediaSource?: MseCtor; MediaSource?: MseCtor };
  return w.ManagedMediaSource ?? w.MediaSource ?? null;
}

function isAbort(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError';
}

export class MkvDirectEngine {
  private disposed = false;
  private video: HTMLVideoElement | null = null;
  private ms: MseLike | null = null;
  private objectUrl: string | null = null;
  private sbVideo: SourceBuffer | null = null;
  private sbAudio: SourceBuffer | null = null;
  private remuxer: MkvRemuxer | null = null;
  private header: MatroskaHeader | null = null;
  private videoInit: Uint8Array | null = null;
  private audioInit: Uint8Array | null = null;
  private cues: CuePoint[] = [];
  private cuesReady: Promise<void> = Promise.resolve();
  private abort: AbortController | null = null;
  /** Incremente a chaque seek/dispose : les boucles d'une generation perimee s'arretent. */
  private generation = 0;
  private chain: Promise<void> = Promise.resolve();
  private wake: (() => void) | null = null;
  private mmsStreaming = true;
  private eof = false;
  private lastTrimAt = 0;
  private listeners: Array<() => void> = [];

  constructor(private readonly opts: MkvDirectEngineOptions) {}

  async attach(video: HTMLVideoElement): Promise<void> {
    this.video = video;
    const Ctor = mseCtor();
    if (Ctor === null) {
      this.fatal('mse', 'MediaSource absent');
      return;
    }
    // 1. En-tete (pistes, SeekHead, 1er cluster).
    let header: MatroskaHeader;
    try {
      let buf = await this.fetchRange(0, HEADER_BYTES);
      header = parseMatroskaHeader(buf);
      if (header.firstClusterPos === null || !header.tracksFound) {
        buf = await this.fetchRange(0, HEADER_BYTES_MAX);
        header = parseMatroskaHeader(buf);
      }
    } catch (e) {
      this.fatal('network', isAbort(e) ? 'timeout en-tete' : 'fetch en-tete');
      return;
    }
    if (this.disposed) return;
    if (header.docType === null || header.firstClusterPos === null || !header.tracksFound) {
      this.fatal('header', 'en-tete Matroska illisible');
      return;
    }
    this.header = header;

    // 2. Pistes lisibles par l'appareil.
    const sel = selectTracks(header, Ctor, this.opts.preferredLanguage);
    if (!sel.ok) {
      this.fatal(sel.error, sel.error);
      return;
    }
    this.remuxer = new MkvRemuxer(header, sel.selection, { videoMime: sel.videoMime, audioMime: sel.audioMime }, (init) => {
      this.audioInit = init;
      this.enqueue(() => this.doAppend(this.sbAudio, init));
    });
    this.videoInit = this.remuxer.videoInitSegment();

    // 3. MediaSource.
    const ms = new Ctor();
    this.ms = ms;
    try {
      (video as HTMLVideoElement & { disableRemotePlayback?: boolean }).disableRemotePlayback = true; // exige par ManagedMediaSource
    } catch {
      // propriete absente : sans effet
    }
    const opened = new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('sourceopen timeout')), 10_000);
      ms.addEventListener(
        'sourceopen',
        () => {
          clearTimeout(t);
          resolve();
        },
        { once: true },
      );
    });
    this.objectUrl = URL.createObjectURL(ms as unknown as MediaSource);
    video.src = this.objectUrl;
    try {
      await opened;
    } catch {
      this.fatal('mse', 'sourceopen');
      return;
    }
    if (this.disposed) return;
    if (typeof ms.streaming === 'boolean') {
      this.mmsStreaming = ms.streaming;
      this.on(ms, 'startstreaming', () => {
        this.mmsStreaming = true;
        this.wakeUp();
      });
      this.on(ms, 'endstreaming', () => {
        this.mmsStreaming = false;
      });
    }
    try {
      this.sbVideo = ms.addSourceBuffer(sel.videoMime);
      this.sbAudio = sel.audioMime !== null ? ms.addSourceBuffer(sel.audioMime) : null;
    } catch (e) {
      this.fatal('mse', `addSourceBuffer: ${e instanceof Error ? e.name : 'erreur'}`);
      return;
    }
    for (const sb of [this.sbVideo, this.sbAudio]) {
      if (sb === null) continue;
      sb.mode = 'segments';
      this.on(sb, 'error', () => this.fatal('mse', 'SourceBuffer error'));
    }
    if (header.durationSecs !== null) {
      try {
        ms.duration = header.durationSecs + 1;
      } catch {
        // duree non modifiable a cet instant : sans gravite
      }
    }
    this.enqueue(() => this.doAppend(this.sbVideo, this.videoInit));

    // 4. Index de seek (asynchrone, non bloquant).
    this.cuesReady = this.loadCues(header, sel.selection.video.number);

    // 5. Evenements lecteur.
    this.on(video, 'seeking', () => void this.handleSeek());
    this.on(video, 'timeupdate', () => {
      this.wakeUp();
      this.maybeTrim();
    });
    this.on(video, 'waiting', () => this.wakeUp());

    // 6. Flux.
    void this.stream(header.firstClusterPos, this.generation);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.generation += 1;
    this.abort?.abort();
    this.wakeUp();
    for (const off of this.listeners) off();
    this.listeners = [];
    if (this.ms !== null && this.ms.readyState === 'open') {
      for (const sb of [this.sbVideo, this.sbAudio]) {
        try {
          if (sb !== null && sb.updating) sb.abort();
        } catch {
          // deja ferme
        }
      }
    }
    if (this.objectUrl !== null) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }

  // --- Reseau ----------------------------------------------------------------

  private async fetchRange(start: number, length: number): Promise<Uint8Array> {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(this.opts.url, {
        headers: { Range: `bytes=${start}-${start + length - 1}` },
        cache: 'no-store',
        credentials: 'omit',
        signal: ac.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const ab = await res.arrayBuffer();
      return new Uint8Array(ab);
    } finally {
      clearTimeout(t);
    }
  }

  private async loadCues(header: MatroskaHeader, videoTrack: number): Promise<void> {
    if (header.cuesPos === null || header.segmentDataStart === null) return;
    try {
      let buf = await this.fetchRange(header.cuesPos, CUES_PROBE_BYTES);
      const id = readId(buf, 0);
      const size = id !== null ? readSize(buf, id.length) : null;
      if (id !== null && size !== null && size.value > 0) {
        const total = id.length + size.length + size.value;
        if (total > buf.length && total < 64 << 20) buf = await this.fetchRange(header.cuesPos, total);
      }
      this.cues = parseCues(buf, header.segmentDataStart, header.timecodeScale, videoTrack);
    } catch {
      this.cues = []; // pas d'index : seek depuis le debut (lent mais fonctionnel)
    }
  }

  /** Lecture continue a partir de `startPos` (Range ouvert), avec reconnexion. */
  private async stream(startPos: number, gen: number): Promise<void> {
    let pos = startPos;
    let attempts = 0;
    while (!this.disposed && gen === this.generation) {
      const ac = new AbortController();
      this.abort = ac;
      try {
        const res = await fetch(this.opts.url, {
          headers: { Range: `bytes=${pos}-` },
          cache: 'no-store',
          credentials: 'omit',
          signal: ac.signal,
        });
        if (!res.ok || res.body === null) {
          this.fatal('network', `HTTP ${res.status}`);
          return;
        }
        const reader = res.body.getReader();
        for (;;) {
          if (this.disposed || gen !== this.generation) {
            await reader.cancel().catch(() => {});
            return;
          }
          await this.waitForDemand(gen);
          if (this.disposed || gen !== this.generation) {
            await reader.cancel().catch(() => {});
            return;
          }
          const { done, value } = await reader.read();
          if (done) {
            const rest = this.remuxer?.flush() ?? [];
            this.appendSegments(rest, gen);
            this.eof = true;
            this.enqueue(() => this.tryEndOfStream());
            return;
          }
          pos += value.byteLength;
          attempts = 0;
          const segs = this.remuxer?.pushBytes(value) ?? [];
          this.appendSegments(segs, gen);
        }
      } catch (e) {
        if (isAbort(e) || this.disposed || gen !== this.generation) return;
        attempts += 1;
        if (attempts > RECONNECT_MAX) {
          this.fatal('network', 'connexion perdue');
          return;
        }
        await new Promise((r) => setTimeout(r, 800 * attempts));
      }
    }
  }

  /** Suspend la lecture reseau tant que le tampon est suffisant. */
  private async waitForDemand(gen: number): Promise<void> {
    for (;;) {
      if (this.disposed || gen !== this.generation) return;
      const v = this.video;
      if (v === null) return;
      const ahead = this.bufferedEnd(v) - v.currentTime;
      if (this.mmsStreaming && ahead < AHEAD_TARGET_S) return;
      await new Promise<void>((resolve) => {
        this.wake = resolve;
        setTimeout(resolve, 1000);
      });
    }
  }

  private wakeUp(): void {
    const w = this.wake;
    this.wake = null;
    w?.();
  }

  private bufferedEnd(v: HTMLVideoElement): number {
    try {
      const b = v.buffered;
      const t = v.currentTime;
      for (let i = 0; i < b.length; i += 1) {
        if (b.start(i) <= t + 0.5 && b.end(i) >= t) return b.end(i);
      }
      return b.length > 0 ? b.end(b.length - 1) : 0;
    } catch {
      return 0;
    }
  }

  private bufferedContains(v: HTMLVideoElement, t: number): boolean {
    try {
      const b = v.buffered;
      for (let i = 0; i < b.length; i += 1) if (b.start(i) <= t && b.end(i) >= t + 1) return true;
    } catch {
      // ignore
    }
    return false;
  }

  // --- MediaSource ---------------------------------------------------------------

  private enqueue(task: () => Promise<void>): void {
    this.chain = this.chain.then(task).catch(() => {});
  }

  private appendSegments(segs: RemuxSegment[], gen: number): void {
    for (const s of segs) {
      const sb = s.track === 'video' ? this.sbVideo : this.sbAudio;
      this.enqueue(async () => {
        if (gen !== this.generation) return;
        await this.doAppend(sb, s.data);
      });
    }
  }

  private untilIdle(sb: SourceBuffer): Promise<void> {
    if (!sb.updating) return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => {
        sb.removeEventListener('updateend', done);
        sb.removeEventListener('error', done);
        sb.removeEventListener('abort', done);
        resolve();
      };
      sb.addEventListener('updateend', done);
      sb.addEventListener('error', done);
      sb.addEventListener('abort', done);
    });
  }

  private async doAppend(sb: SourceBuffer | null, data: Uint8Array | null): Promise<void> {
    if (sb === null || data === null || this.disposed || this.ms?.readyState !== 'open') return;
    await this.untilIdle(sb);
    if (this.disposed || this.ms?.readyState !== 'open') return;
    try {
      sb.appendBuffer(data as BufferSource);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'QuotaExceededError') {
        await this.trim(true);
        await this.untilIdle(sb);
        try {
          sb.appendBuffer(data as BufferSource);
        } catch {
          this.fatal('quota', 'QuotaExceededError');
          return;
        }
      } else {
        this.fatal('mse', e instanceof Error ? e.name : 'appendBuffer');
        return;
      }
    }
    await this.untilIdle(sb);
  }

  private maybeTrim(): void {
    const now = Date.now();
    if (now - this.lastTrimAt < 10_000) return;
    this.lastTrimAt = now;
    this.enqueue(() => this.trim(false));
  }

  private async trim(aggressive: boolean): Promise<void> {
    const v = this.video;
    if (v === null || this.ms?.readyState !== 'open') return;
    const keep = aggressive ? 5 : BACK_BUFFER_S;
    const end = v.currentTime - keep;
    if (end <= 0) return;
    for (const sb of [this.sbVideo, this.sbAudio]) {
      if (sb === null) continue;
      try {
        const b = sb.buffered;
        if (b.length === 0 || b.start(0) >= end - 5) continue;
        await this.untilIdle(sb);
        sb.remove(0, end);
        await this.untilIdle(sb);
      } catch {
        // purge impossible a cet instant : on reessaiera
      }
    }
  }

  private async tryEndOfStream(): Promise<void> {
    if (!this.eof || this.disposed || this.ms === null || this.ms.readyState !== 'open') return;
    for (const sb of [this.sbVideo, this.sbAudio]) if (sb !== null) await this.untilIdle(sb);
    try {
      this.ms.endOfStream();
    } catch {
      // deja termine
    }
  }

  // --- Seek ------------------------------------------------------------------------

  private async handleSeek(): Promise<void> {
    const v = this.video;
    const header = this.header;
    if (v === null || header === null || this.remuxer === null || this.disposed) return;
    const target = v.currentTime;
    if (this.bufferedContains(v, target)) return;
    this.generation += 1;
    const gen = this.generation;
    this.abort?.abort();
    this.wakeUp();
    await this.chain;
    await this.cuesReady;
    if (this.disposed || gen !== this.generation) return;
    for (const sb of [this.sbVideo, this.sbAudio]) {
      try {
        if (sb !== null && this.ms?.readyState === 'open') sb.abort();
      } catch {
        // SourceBuffer deja detache
      }
    }
    this.remuxer.reset();
    this.eof = false;
    // Temps fichier = temps lecteur - decalage de timeline (DTS >= 0).
    const fileMs = target * 1000 - this.remuxer.info().timeOffsetMs;
    let pos = header.firstClusterPos ?? 0;
    for (const c of this.cues) {
      if (c.timeMs <= fileMs + 1) pos = c.clusterPos;
      else break;
    }
    this.enqueue(() => this.doAppend(this.sbVideo, this.videoInit));
    if (this.audioInit !== null) this.enqueue(() => this.doAppend(this.sbAudio, this.audioInit));
    void this.stream(pos, gen);
  }

  // --- Divers ----------------------------------------------------------------------

  private on(target: EventTarget, type: string, fn: () => void): void {
    target.addEventListener(type, fn);
    this.listeners.push(() => target.removeEventListener(type, fn));
  }

  private fatal(code: MkvDirectErrorCode, detail: string): void {
    if (this.disposed) return;
    this.opts.onFatal(code, detail);
    this.dispose();
  }
}
