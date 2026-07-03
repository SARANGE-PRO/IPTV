'use client';

import type Hls from 'hls.js';
import { useEffect, useRef, useState } from 'react';
import { PlaybackErrorInfo } from '@/components/player/PlaybackErrorInfo';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { nativeDurationSeconds } from '@/services/player/mediaDurationService';
import { isSeekable } from '@/services/player/playbackCapabilityService';
import type { PlaybackErrorCode, PlaybackFailure } from '@/types/playbackDiagnostics';
import { secureImageSrc, secureMediaUrl } from '@/utils/secureUrl';

/**
 * Lecteur video isole. HLS natif (Safari iOS/iPadOS) prioritaire ; hls.js
 * charge en lazy uniquement si necessaire. URLs directes vers le serveur
 * Xtream — jamais via Vercel, jamais en cache service worker.
 */

export interface VideoPlayerProps {
  src: string;
  poster?: string | null;
  live?: boolean;
  startAt?: number;
  /** Duree totale de repli (Xtream/TMDB) quand le player n'expose pas de duree. */
  duration?: number | null;
  /** `force` = flush garanti (pause/fin/pagehide/demontage) : la page doit le
   * relayer a saveProgress pour contourner le throttle, sinon la derniere
   * position est perdue quand iOS gele la PWA en arriere-plan. */
  onProgress?: (positionSec: number, durationSec: number | null, force: boolean) => void;
  onEnded?: () => void;
  /** Appele quand la lecture echoue (permet de proposer un repli VLC). */
  onError?: () => void;
  /**
   * Route le flux via la passerelle (transcodage) et autorise les conteneurs
   * non-natifs (MKV/AVI). Decide par la page appelante selon la sante de la
   * passerelle. Defaut false = lecture directe (MP4/HLS natif Safari).
   */
  transcode?: boolean;
  /**
   * Safari + VOD non-natif : demande a la passerelle un flux HLS (Safari refuse
   * le fMP4 progressif du transcodage). Decide par la page (plan gateway ET HLS
   * natif). Sans effet pour le direct/Chrome.
   */
  preferHls?: boolean;
  /** Contexte pour le diagnostic d'erreur (bouton "i"). */
  contentType?: 'live' | 'vod' | 'episode';
  container?: string | null;
  className?: string;
}

type PlayerStatus = 'loading' | 'ready' | 'error';

/** Safari (iOS surtout) n'expose PAS `pictureInPictureEnabled` : il utilise
 * l'API webkit `webkitSetPresentationMode` (hors typings standard). */
type WebkitVideo = HTMLVideoElement & {
  webkitSupportsPresentationMode?: (mode: string) => boolean;
  webkitSetPresentationMode?: (mode: 'inline' | 'picture-in-picture' | 'fullscreen') => void;
  webkitPresentationMode?: string;
};

/** Ferme un eventuel PiP pointant sur cette video (standard ou webkit). */
function exitPipFor(video: HTMLVideoElement): void {
  const v = video as WebkitVideo;
  if (typeof v.webkitSetPresentationMode === 'function' && v.webkitPresentationMode === 'picture-in-picture') {
    try {
      v.webkitSetPresentationMode('inline');
    } catch {
      // PiP webkit indisponible : rien a faire.
    }
    return;
  }
  if (typeof document !== 'undefined' && document.pictureInPictureElement === video) {
    void document.exitPictureInPicture().catch(() => {});
  }
}

const PROGRESS_INTERVAL_MS = 4000;

/** Conteneurs qu'aucun navigateur ne decode nativement (transcodage requis). */
const UNSUPPORTED_CONTAINER = /^(mkv|avi|wmv|flv|mpg|mpeg|vob|divx|m2ts|ts)$/i;

/** Renvoie l'extension en MAJ si le conteneur est illisible en navigateur, sinon null. */
function unsupportedContainer(rawSrc: string): string | null {
  const path = rawSrc.split(/[?#]/)[0] ?? '';
  const ext = path.match(/\.([a-z0-9]{2,5})$/i)?.[1];
  return ext !== undefined && UNSUPPORTED_CONTAINER.test(ext) ? ext.toUpperCase() : null;
}

export function VideoPlayer({
  src,
  poster,
  live = false,
  startAt = 0,
  duration = null,
  onProgress,
  onEnded,
  onError,
  transcode = false,
  preferHls = false,
  contentType,
  container = null,
  className,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [status, setStatus] = useState<PlayerStatus>('loading');
  const [message, setMessage] = useState<string | null>(null);
  const [failure, setFailure] = useState<PlaybackFailure | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [limitedSeek, setLimitedSeek] = useState(false);
  const [pipSupported, setPipSupported] = useState(false);
  // Flux HTTP -> passerelle HTTPS (Xtream HTTP-only + mixed-content). C'est la
  // passerelle qui choisit passthrough (MP4/segments) ou remux/transcodage
  // (MKV/HEVC, live .ts). Le drapeau `transcode` ne sert plus qu'a autoriser
  // les conteneurs non-natifs et a contextualiser le diagnostic (voir plus bas).
  const streamUrl = secureMediaUrl(src, { hls: preferHls });
  const posterUrl = secureImageSrc(poster);

  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const startAtRef = useRef(startAt);
  startAtRef.current = startAt;
  const liveRef = useRef(live);
  liveRef.current = live;
  const durationRef = useRef(duration);
  durationRef.current = duration;
  const resumedRef = useRef(false);
  const lastSentRef = useRef(0);

  useEffect(() => {
    const video = videoRef.current;
    if (video === null) return;
    let cancelled = false;
    let networkRecoveries = 0;
    let mediaRecoveries = 0;
    let loadTimer: ReturnType<typeof setTimeout> | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    setStatus('loading');
    setMessage(null);
    setFailure(null);
    setLimitedSeek(false);
    resumedRef.current = false;

    const clearLoadTimer = () => {
      if (loadTimer !== null) {
        clearTimeout(loadTimer);
        loadTimer = null;
      }
    };

    const fail = (
      code: PlaybackErrorCode,
      msg: string,
      extra?: Pick<PlaybackFailure, 'httpStatus' | 'mediaErrorCode' | 'detail'>,
    ) => {
      clearLoadTimer();
      if (!cancelled) {
        setStatus('error');
        setMessage(msg);
        setFailure({ code, message: msg, ...extra });
        onErrorRef.current?.();
      }
    };

    if (streamUrl === null) {
      fail('invalid_url', 'URL du flux invalide.');
      return;
    }

    // Garde conteneur : inutile de tenter la lecture d'un format que le
    // navigateur ne decode pas — message clair immediat (pas un faux "erreur reseau").
    const badContainer = unsupportedContainer(src);
    if (badContainer !== null && !live && !transcode) {
      fail(
        'unsupported_container',
        `Format ${badContainer} non lisible dans un navigateur (transcodage requis). ` +
          'Les films .mp4 et le Live se lisent normalement.',
        { detail: badContainer },
      );
      return;
    }

    const sendProgress = (force: boolean) => {
      if (liveRef.current) return;
      const now = Date.now();
      if (!force && now - lastSentRef.current < PROGRESS_INTERVAL_MS) return;
      lastSentRef.current = now;
      // Duree effective : native fiable sinon repli Xtream/TMDB (jamais Infinity/NaN/0).
      const effectiveDuration = nativeDurationSeconds(video.duration) ?? durationRef.current ?? null;
      onProgressRef.current?.(video.currentTime, effectiveDuration, force);
    };

    // Evalue la seekability (lazy) et applique la reprise UNE fois si possible.
    // Appelee a loadedmetadata ET canplay (les plages seekable arrivent tard).
    const evaluateSeek = () => {
      if (liveRef.current || cancelled) return;
      const seekable = isSeekable(video);
      setLimitedSeek(!seekable);
      if (resumedRef.current || !seekable || startAtRef.current <= 0) return;
      const effDur = nativeDurationSeconds(video.duration) ?? durationRef.current;
      if (effDur === null || startAtRef.current < effDur - 5) {
        resumedRef.current = true;
        try {
          video.currentTime = startAtRef.current;
        } catch {
          // Le flux refuse le seek : on ne boucle pas, lecture depuis le debut.
        }
      }
    };

    const handleLoadedMetadata = () => evaluateSeek();
    const handleReady = () => {
      if (cancelled) return;
      clearLoadTimer();
      setStatus('ready');
      evaluateSeek();
    };
    const handleTimeUpdate = () => sendProgress(false);
    const handlePause = () => sendProgress(true);
    const handleEnded = () => {
      sendProgress(true);
      onEndedRef.current?.();
    };
    const handleError = () => {
      fail(
        'native_error',
        liveRef.current
          ? 'Lecture Live impossible dans ce navigateur (format non lu — fréquent sur iPhone/iPad —, flux hors ' +
              'service, limite de connexions, ou passerelle arrêtée). Essaie une autre version, ou ouvre dans VLC.'
          : 'Lecture impossible : format non lu par ce navigateur (ex. MKV sur iPhone), flux hors service ou ' +
              'limite de connexions atteinte. Ouvre dans VLC, ou réessaie.',
        { mediaErrorCode: video.error?.code ?? null },
      );
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('canplay', handleReady);
    video.addEventListener('playing', handleReady);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('pause', handlePause);
    video.addEventListener('ended', handleEnded);
    video.addEventListener('error', handleError);

    // Flush robuste de la progression : fermeture/retour d'onglet, navigation.
    const flushProgress = () => sendProgress(true);
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') sendProgress(true);
    };
    window.addEventListener('pagehide', flushProgress);
    document.addEventListener('visibilitychange', handleVisibility);

    const isHls = /\.m3u8(?:$|[?#])/i.test(streamUrl);
    const canNativeHls = video.canPlayType('application/vnd.apple.mpegurl') !== '';

    const setup = async () => {
      if (!isHls || canNativeHls) {
        // Safari/iOS conserve ainsi son lecteur HLS natif.
        video.src = streamUrl;
      } else {
        try {
          const mod = await import('hls.js');
          const HlsCtor = mod.default;
          if (cancelled) return;
          if (!HlsCtor.isSupported()) {
            fail('hls_unsupported', 'Lecture HLS non supportée par ce navigateur.');
            return;
          }
          const hls = new HlsCtor({
            enableWorker: true,
            lowLatencyMode: liveRef.current,
            backBufferLength: liveRef.current ? 30 : 90,
          });
          hlsRef.current = hls;
          hls.on(HlsCtor.Events.ERROR, (_event, data) => {
            if (!data.fatal) return;
            if (data.type === HlsCtor.ErrorTypes.NETWORK_ERROR && networkRecoveries < 2) {
              networkRecoveries += 1;
              // Recharge espacee : un pic reseau temporaire ne doit pas boucler
              // en rafale (backoff simple, annule au cleanup).
              retryTimer = setTimeout(() => {
                if (!cancelled) hls.startLoad();
              }, 600 * networkRecoveries);
              return;
            }
            if (data.type === HlsCtor.ErrorTypes.MEDIA_ERROR && mediaRecoveries < 1) {
              mediaRecoveries += 1;
              hls.recoverMediaError();
              return;
            }
            // Log diagnostic sans URL (jamais exposer le flux).
            if (typeof console !== 'undefined') {
              console.warn('[VideoPlayer] HLS fatal', { type: data.type, details: data.details });
            }
            const httpStatus = (data.response as { code?: number } | undefined)?.code ?? null;
            const hlsCode: PlaybackErrorCode =
              data.type === HlsCtor.ErrorTypes.NETWORK_ERROR
                ? 'hls_network'
                : data.type === HlsCtor.ErrorTypes.MEDIA_ERROR
                  ? 'hls_media'
                  : 'hls_fatal';
            fail(hlsCode, 'Erreur HLS fatale. Verifiez HTTPS, CORS et la disponibilite du flux.', {
              httpStatus,
              detail: data.details ?? null,
            });
          });
          hls.loadSource(streamUrl);
          hls.attachMedia(video);
        } catch {
          fail('hls_module_failed', 'Impossible de charger le module de lecture HLS.');
          return;
        }
      }
      void video.play().catch(() => {
        // Autoplay bloque : l'utilisateur lancera la lecture manuellement.
      });
    };

    // Filet de securite : un flux mort peut n'emettre ni 'canplay' ni 'error'
    // et laisser le spinner tourner indefiniment. On borne l'attente.
    loadTimer = setTimeout(() => {
      loadTimer = null;
      fail(
        'load_timeout',
        liveRef.current
          ? 'Le flux Live ne demarre pas (serveur lent, hors service ou limite de connexions). Reessaie ou ouvre dans VLC.'
          : 'La lecture ne demarre pas (serveur lent ou flux indisponible). Reessaie ou ouvre dans VLC.',
      );
    }, liveRef.current ? 22_000 : 40_000);
    void setup();

    return () => {
      cancelled = true;
      clearLoadTimer();
      if (retryTimer !== null) clearTimeout(retryTimer);
      sendProgress(true); // flush du timestamp a la sortie
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('canplay', handleReady);
      video.removeEventListener('playing', handleReady);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('ended', handleEnded);
      video.removeEventListener('error', handleError);
      window.removeEventListener('pagehide', flushProgress);
      document.removeEventListener('visibilitychange', handleVisibility);
      if (hlsRef.current !== null) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      // Un zapping/changement de flux ne doit pas laisser une fenetre PiP
      // orpheline pointant sur une <video> qu'on detruit.
      exitPipFor(video);
      video.removeAttribute('src');
      video.load();
    };
  }, [streamUrl, attempt]);

  useEffect(() => {
    const v = videoRef.current as WebkitVideo | null;
    const standard = typeof document !== 'undefined' && document.pictureInPictureEnabled === true;
    // iOS Safari : PiP via l'API webkit (le bouton n'apparaissait jamais sur iPhone).
    const webkit = v?.webkitSupportsPresentationMode?.('picture-in-picture') === true;
    setPipSupported(standard || webkit);
  }, []);

  const togglePip = async () => {
    const video = videoRef.current as WebkitVideo | null;
    if (video === null) return;
    try {
      // iOS Safari d'abord (pas d'API standard) : bascule inline <-> PiP.
      if (typeof video.webkitSetPresentationMode === 'function' && document.pictureInPictureEnabled !== true) {
        video.webkitSetPresentationMode(
          video.webkitPresentationMode === 'picture-in-picture' ? 'inline' : 'picture-in-picture',
        );
        return;
      }
      if (document.pictureInPictureElement !== null) await document.exitPictureInPicture();
      else await video.requestPictureInPicture();
    } catch {
      // Picture-in-Picture indisponible sur ce media/navigateur.
    }
  };

  return (
    <div>
      <div className={cn('relative overflow-hidden rounded-2xl bg-black', className)}>
        <video
          ref={videoRef}
          controls
          playsInline
          autoPlay
          poster={posterUrl ?? undefined}
          className="aspect-video w-full bg-black"
        />
        {pipSupported && status === 'ready' && (
          <button
            type="button"
            onClick={() => void togglePip()}
            aria-label="Picture-in-Picture"
            title="Picture-in-Picture"
            className="absolute right-2 top-2 rounded-lg bg-black/60 p-2 text-white/90 transition-colors hover:bg-black/80"
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden>
              <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.6" />
              <rect x="12" y="11" width="7" height="5" rx="1" fill="currentColor" />
            </svg>
          </button>
        )}
        {status === 'loading' && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/40">
            <span className="h-8 w-8 animate-spin rounded-full border-2 border-ink-500 border-t-accent" />
          </div>
        )}
        {status === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 overflow-y-auto bg-black/85 px-6 py-6 text-center">
            <p className="text-sm leading-relaxed text-fg">{message}</p>
            <Button size="sm" variant="secondary" onClick={() => setAttempt((a) => a + 1)}>
              Réessayer
            </Button>
            {failure !== null && (
              <PlaybackErrorInfo
                failure={failure}
                context={{
                  type: contentType ?? (live ? 'live' : 'vod'),
                  container,
                  transcode,
                }}
              />
            )}
          </div>
        )}
      </div>
      {limitedSeek && !live && status !== 'error' && (
        <p className="mt-2 text-[11px] text-fg-faint">
          Ce flux ne permet pas toujours une reprise précise (lecture progressive).
        </p>
      )}
    </div>
  );
}
