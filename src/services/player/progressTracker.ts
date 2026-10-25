import { nativeDurationSeconds } from '@/services/player/mediaDurationService';
import { isSeekable } from '@/services/player/playbackCapabilityService';
import { resumePosition, type StreamKind } from '@/services/player/playbackRecoveryPolicy';

/** Rappel de progression de la page (`force` = flush garanti, voir VideoPlayer). */
export type ProgressSink = (positionSec: number, durationSec: number | null, force: boolean) => void;

/** Derniere position VOD connue d'un flux : survit aux relances et au bouton Reessayer. */
export interface PositionMemo {
  get: () => { url: string; position: number } | null;
  set: (value: { url: string; position: number }) => void;
}

const PROGRESS_INTERVAL_MS = 4000;

export interface ProgressTrackerOptions {
  video: HTMLVideoElement;
  kind: StreamKind;
  url: string;
  /** Reprise par OFFSET serveur : le flux commence a cette position. */
  baseOffset: number;
  /** Le flux a joue depuis le dernier (re)chargement (position fiable). */
  started: () => boolean;
  /** Rappel courant de la page (relu a chaque envoi non final). */
  sink: () => ProgressSink | undefined;
  duration: () => number | null;
  startAt: () => number;
  memo: PositionMemo;
  onLimitedSeek: (limited: boolean) => void;
}

/**
 * Progression et reprise d'UN flux VOD (le Live n'a ni l'une ni l'autre).
 * Les rappels sont FIGES au dernier envoi : au zapping, la meme <video> passe
 * au flux suivant et le nettoyage doit encore rapporter la position a l'ANCIEN
 * titre, alors que la page pointe deja sur le nouveau.
 */
export function createProgressTracker(opts: ProgressTrackerOptions) {
  const { video, kind, baseOffset } = opts;
  let lastSent = 0;
  let resumed = false;
  let sink = opts.sink();
  let lastDuration = opts.duration();

  return {
    /** `final` : dernier envoi du flux (nettoyage) — rappels figes. */
    send(force: boolean, final = false): void {
      // Avant le premier `playing`, currentTime vaut encore 0 (ou un seek en
      // cours) : l'envoyer ecraserait la position de reprise enregistree.
      if (kind === 'live' || !opts.started()) return;
      const now = Date.now();
      if (!force && now - lastSent < PROGRESS_INTERVAL_MS) return;
      lastSent = now;
      if (!final) {
        sink = opts.sink();
        lastDuration = opts.duration();
      }
      // Reprise par offset serveur : la position reelle = offset + temps du flux,
      // et la duree totale = offset + duree du flux transcode (a defaut, la duree fournie).
      const nat = nativeDurationSeconds(video.duration);
      const effectiveDuration =
        baseOffset > 0 ? (nat !== null ? baseOffset + nat : (lastDuration ?? null)) : (nat ?? lastDuration ?? null);
      sink?.(baseOffset + video.currentTime, effectiveDuration, force);
    },

    /** Position courante memorisee : une relance y reprend. */
    remember(): void {
      if (opts.started() && kind === 'vod') opts.memo.set({ url: opts.url, position: baseOffset + video.currentTime });
    },

    /**
     * Seekability (lazy) + reprise UNE fois si possible. Appelee a
     * loadedmetadata, canplay et playing (les plages seekable arrivent tard).
     */
    evaluateSeek(): void {
      if (kind === 'live') return;
      // Reprise par offset serveur : le flux commence deja a la bonne position,
      // aucun seek a faire (et il reste seekable dans sa fenetre transcodee).
      if (baseOffset > 0) {
        opts.onLimitedSeek(false);
        return;
      }
      const seekable = isSeekable(video);
      opts.onLimitedSeek(!seekable);
      const memo = opts.memo.get();
      const target = resumePosition(opts.startAt(), memo !== null && memo.url === opts.url ? memo.position : null);
      if (resumed || !seekable || target <= 0) return;
      const effDur = nativeDurationSeconds(video.duration) ?? opts.duration();
      if (effDur === null || target < effDur - 5) {
        resumed = true;
        try {
          video.currentTime = target;
        } catch {
          // Le flux refuse le seek : on ne boucle pas, lecture depuis le debut.
        }
      }
    },

    /** Rechargement : la reprise sera rejouee sur la nouvelle source. */
    resetResume(): void {
      resumed = false;
    },
  };
}

export type ProgressTracker = ReturnType<typeof createProgressTracker>;
