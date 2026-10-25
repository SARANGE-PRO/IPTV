// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pauseByUser } from '@/services/player/playbackIntent';
import { startPlaybackSession, type PhaseUpdate, type PlayerPhase } from '@/services/player/playbackSession';
import type { PlaybackFailure } from '@/types/playbackDiagnostics';

/**
 * Supervision d'un flux (services/player/playbackSession) sur une FAUSSE
 * <video> pilotee a la main, horloge simulee : relances, anti-gel, pause
 * subie, hors-ligne, autoplay refuse, reprise VOD, progression.
 */

type Ranges = { length: number; start: (i: number) => number; end: (i: number) => number };
const ranges = (list: [number, number][]): Ranges => ({
  length: list.length,
  start: (i) => list[i]![0],
  end: (i) => list[i]![1],
});

class FakeVideo extends EventTarget {
  src = '';
  paused = true;
  ended = false;
  seeking = false;
  currentTime = 0;
  duration = Number.NaN;
  readyState = 0;
  error: { code: number } | null = null;
  buffered: Ranges = ranges([]);
  seekable: Ranges = ranges([]);
  plays = 0;
  loads = 0;
  playImpl: () => Promise<void> = () => {
    this.paused = false;
    return Promise.resolve();
  };
  canPlayType(): string {
    return 'maybe'; // HLS natif (Safari)
  }
  play(): Promise<void> {
    this.plays += 1;
    return this.playImpl();
  }
  pause(): void {
    this.paused = true;
    this.emit('pause');
  }
  load(): void {
    this.loads += 1;
  }
  getAttribute(name: string): string | null {
    return name === 'src' && this.src !== '' ? this.src : null;
  }
  removeAttribute(name: string): void {
    if (name === 'src') this.src = '';
  }
  emit(type: string): void {
    this.dispatchEvent(new Event(type));
  }
  /** Le flux demarre : metadonnees, donnees, lecture. */
  start(at = 0): void {
    this.currentTime = at;
    this.readyState = 4;
    this.paused = false;
    this.emit('loadedmetadata');
    this.emit('canplay');
    this.emit('playing');
  }
}

let online = true;

interface StartOptions {
  live?: boolean;
  src?: string;
  url?: string | null;
  startAt?: number;
  transcode?: boolean;
  /** Reglage de la fausse <video> AVANT le branchement (play() part aussitot). */
  prepare?: (video: FakeVideo) => void;
}

function start(over: StartOptions = {}) {
  const video = new FakeVideo();
  over.prepare?.(video);
  let phase: PlayerPhase = 'loading';
  const phases: PlayerPhase[] = [];
  const failures: PlaybackFailure[] = [];
  const progress: { sink: string; pos: number; force: boolean }[] = [];
  let sinkName = 'A';
  let memo: { url: string; position: number } | null = null;
  const src = over.src ?? 'http://srv:8080/movie/u/p/1.mp4';
  const ev = { playing: 0, ended: 0 };
  const stop = startPlaybackSession(
    video as unknown as HTMLVideoElement,
    {
      url: over.url === undefined ? src : over.url,
      rawSrc: src,
      live: over.live ?? false,
      startOffset: 0,
      transcode: over.transcode ?? false,
      preferHls: false,
      directMkv: false,
      startAt: () => over.startAt ?? 0,
      duration: () => 6000,
      preferredLanguage: () => 'VF',
      progressSink: () => {
        const name = sinkName;
        return (pos, _dur, force) => progress.push({ sink: name, pos, force });
      },
      memo: { get: () => memo, set: (v) => (memo = v) },
    },
    {
      setPhase: (u: PhaseUpdate) => {
        phase = typeof u === 'function' ? u(phase) : u;
        phases.push(phase);
      },
      setLimitedSeek: () => undefined,
      onFailure: (f) => failures.push(f),
      onPlaying: () => (ev.playing += 1),
      onEnded: () => (ev.ended += 1),
      onDirectMkvFailed: () => undefined,
    },
  );
  return {
    video,
    stop,
    failures,
    progress,
    ev,
    phase: () => phase,
    phases,
    setSink: (name: string) => (sinkName = name),
  };
}

const tick = (ms: number) => vi.advanceTimersByTimeAsync(ms);

beforeEach(() => {
  vi.useFakeTimers();
  online = true;
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => online });
});
afterEach(() => {
  vi.useRealTimers();
});

describe('demarrage', () => {
  it('branche la source et lance la lecture', async () => {
    const s = start();
    await tick(0);
    expect(s.video.src).toBe('http://srv:8080/movie/u/p/1.mp4');
    expect(s.video.plays).toBe(1);
    expect(s.phase()).toBe('loading');
    s.video.start();
    expect(s.phase()).toBe('ready');
    expect(s.ev.playing).toBe(1);
    s.stop();
  });

  it('URL invalide : echec definitif immediat', () => {
    const s = start({ url: null });
    expect(s.failures[0]?.code).toBe('invalid_url');
    expect(s.phase()).toBe('error');
  });

  it('MKV sans transcodage : format illisible annonce, aucune tentative', async () => {
    const s = start({ src: 'http://srv:8080/movie/u/p/1.mkv' });
    await tick(0);
    expect(s.failures[0]?.code).toBe('unsupported_container');
    expect(s.video.plays).toBe(0);
  });

  it('autoplay refuse : plus de spinner ni de faux echec, le tap relance la garde', async () => {
    const s = start({
      live: true,
      prepare: (v) => {
        v.playImpl = () => Promise.reject(Object.assign(new Error('geste requis'), { name: 'NotAllowedError' }));
      },
    });
    await tick(0);
    expect(s.phase()).toBe('ready');
    await tick(60_000);
    expect(s.failures).toHaveLength(0);
    expect(s.phases).not.toContain('reconnecting');
    // Tap sur le bouton lecture natif : la garde de demarrage repart.
    s.video.emit('play');
    expect(s.phase()).toBe('loading');
    s.stop();
  });
});

describe('relances', () => {
  it('Live qui ne demarre pas : 3 relances puis echec explique', async () => {
    const s = start({ live: true });
    await tick(15_000); // startupTimeout live (1er essai)
    expect(s.phase()).toBe('reconnecting');
    await tick(800 + 12_000 + 2500 + 12_000 + 5000 + 12_000 + 100);
    expect(s.failures).toHaveLength(1);
    expect(s.failures[0]?.code).toBe('load_timeout');
    expect(s.failures[0]?.detail).toContain('3 relance(s) auto');
    expect(s.video.loads).toBeGreaterThanOrEqual(3);
  });

  it('VOD « source non lue » avant demarrage : une seule relance', async () => {
    const s = start();
    await tick(0);
    s.video.error = { code: 4 };
    s.video.emit('error');
    expect(s.phase()).toBe('reconnecting');
    await tick(1000);
    expect(s.video.src).not.toBe('');
    s.video.emit('error');
    expect(s.failures[0]?.code).toBe('native_error');
  });

  it('direct fige 10 s : rechargement automatique', async () => {
    const s = start({ live: true });
    await tick(0);
    s.video.start(100);
    await tick(10_500);
    expect(s.phase()).toBe('reconnecting');
    await tick(800);
    expect(s.video.plays).toBe(2);
    s.stop();
  });

  it('fin du direct (ended) : reouverture, pas de fin de lecture', async () => {
    const s = start({ live: true });
    await tick(0);
    s.video.start();
    s.video.emit('ended');
    expect(s.ev.ended).toBe(0);
    expect(s.phase()).toBe('reconnecting');
    s.stop();
  });

  it('un rechargement annule une relance deja programmee (pas de double chargement)', async () => {
    const s = start({ live: true });
    await tick(0);
    s.video.start();
    // Pause longue (voulue) du direct, puis coupure serveur : relance programmee...
    pauseByUser(s.video as unknown as HTMLVideoElement);
    await tick(31_000);
    s.video.emit('ended'); // -> recover('ended') : relance dans 800 ms
    expect(s.phase()).toBe('reconnecting');
    const plays = s.video.plays;
    // ... et l'utilisateur relance le direct pendant ce temps (rejoindre le direct).
    s.video.paused = false;
    s.video.emit('play');
    await tick(5000);
    // Un seul rechargement de plus (celui du geste), la relance a ete annulee.
    expect(s.video.plays).toBe(plays + 1);
    s.stop();
  });
});

describe('pause subie / voulue', () => {
  it('tampon vide : pause SUBIE, relance seule quand le tampon revient', async () => {
    const s = start({ live: true });
    await tick(0);
    s.video.start();
    s.video.readyState = 2;
    s.video.paused = true;
    s.video.emit('waiting');
    s.video.emit('pause');
    expect(s.phase()).toBe('buffering');
    const plays = s.video.plays;
    s.video.readyState = 4;
    await tick(1000);
    expect(s.video.plays).toBe(plays + 1);
    s.stop();
  });

  it('pause de l’utilisateur (nos commandes) : jamais relancee', async () => {
    const s = start({ live: true });
    await tick(0);
    s.video.start();
    s.video.readyState = 2;
    pauseByUser(s.video as unknown as HTMLVideoElement);
    expect(s.phase()).toBe('ready');
    const plays = s.video.plays;
    await tick(5000);
    expect(s.video.plays).toBe(plays);
    s.stop();
  });

  it('direct repris apres plus de 30 s de pause : rejoint le direct (rechargement)', async () => {
    const s = start({ live: true });
    await tick(0);
    s.video.start();
    pauseByUser(s.video as unknown as HTMLVideoElement);
    await tick(31_000);
    const loads = s.video.loads;
    s.video.paused = false;
    s.video.emit('play');
    expect(s.video.loads).toBe(loads + 1);
    expect(s.phase()).toBe('reconnecting');
    s.stop();
  });
});

describe('pause native pendant un chargement', () => {
  it('geste sur la video puis pause tampon vide : pause VOULUE, jamais relancee', async () => {
    const s = start({ live: true });
    await tick(0);
    s.video.start();
    s.video.readyState = 2;
    s.video.emit('waiting');
    s.video.emit('pointerdown');
    s.video.paused = true;
    s.video.emit('pause');
    expect(s.phase()).toBe('ready');
    const plays = s.video.plays;
    s.video.readyState = 4;
    await tick(5000);
    expect(s.video.plays).toBe(plays);
    s.stop();
  });

  it('geste ancien (> 1 s) : la pause tampon vide reste subie et relancee', async () => {
    const s = start({ live: true });
    await tick(0);
    s.video.start();
    s.video.emit('pointerdown');
    await tick(2000);
    s.video.readyState = 2;
    s.video.paused = true;
    s.video.emit('waiting');
    s.video.emit('pause');
    expect(s.phase()).toBe('buffering');
    s.stop();
  });
});

describe('reseau', () => {
  it('hors-ligne : attend le reseau sans bruler les relances, reprend au retour', async () => {
    const s = start({ live: true });
    await tick(0);
    s.video.start();
    online = false;
    s.video.emit('ended');
    expect(s.phase()).toBe('offline');
    online = true;
    window.dispatchEvent(new Event('online'));
    expect(s.phase()).toBe('reconnecting');
    const plays = s.video.plays;
    await tick(600);
    expect(s.video.plays).toBe(plays + 1);
    s.stop();
  });

  it('retour du reseau SANS evenement `online` (PWA gelee) : rattrape par le chien de garde', async () => {
    const s = start({ live: true });
    await tick(0);
    s.video.start();
    online = false;
    s.video.emit('ended');
    expect(s.phase()).toBe('offline');
    online = true; // pas d'evenement
    await tick(1000);
    expect(s.phase()).toBe('reconnecting');
    s.stop();
  });
});

describe('VOD : reprise et progression', () => {
  it('reprend a la position demandee des que le flux est seekable', async () => {
    const s = start({ startAt: 120 });
    await tick(0);
    s.video.seekable = ranges([[0, 6000]]);
    s.video.duration = 6000;
    s.video.emit('loadedmetadata');
    expect(s.video.currentTime).toBe(120);
    s.stop();
  });

  it('progression envoyee (espacee), position finale a l’ANCIEN titre au nettoyage', async () => {
    const s = start();
    await tick(0);
    s.video.start(10);
    s.video.currentTime = 12;
    s.video.emit('timeupdate');
    expect(s.progress.at(-1)).toMatchObject({ sink: 'A', pos: 12, force: false });
    // La page passe deja au titre suivant (rappel B) : le flush final va a A.
    s.setSink('B');
    s.video.currentTime = 15;
    s.stop();
    expect(s.progress.at(-1)).toMatchObject({ sink: 'A', pos: 15, force: true });
  });

  it('une relance VOD reprend a la derniere position connue', async () => {
    const s = start();
    await tick(0);
    s.video.seekable = ranges([[0, 6000]]);
    s.video.duration = 6000;
    s.video.start(0);
    s.video.currentTime = 300;
    s.video.emit('timeupdate');
    // Gel 25 s -> relance -> la nouvelle source reprend a 300 s.
    await tick(25_500);
    expect(s.phase()).toBe('reconnecting');
    await tick(1000);
    s.video.currentTime = 0;
    s.video.emit('loadedmetadata');
    expect(s.video.currentTime).toBe(300);
    s.stop();
  });
});
