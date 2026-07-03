'use client';

import type Hls from 'hls.js';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
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
  onProgress?: (positionSec: number, durationSec: number | null) => void;
  onEnded?: () => void;
  className?: string;
}

type PlayerStatus = 'loading' | 'ready' | 'error';

const PROGRESS_INTERVAL_MS = 4000;

/** Si la passerelle transcode (proxy maison + ffmpeg), on ne bloque plus les MKV. */
const TRANSCODE_GATEWAY = process.env.NEXT_PUBLIC_MEDIA_GATEWAY_TRANSCODE === '1';

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
  onProgress,
  onEnded,
  className,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [status, setStatus] = useState<PlayerStatus>('loading');
  const [message, setMessage] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const streamUrl = secureMediaUrl(src);
  const posterUrl = secureImageSrc(poster);

  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;
  const startAtRef = useRef(startAt);
  startAtRef.current = startAt;
  const liveRef = useRef(live);
  liveRef.current = live;
  const lastSentRef = useRef(0);

  useEffect(() => {
    const video = videoRef.current;
    if (video === null) return;
    let cancelled = false;
    let networkRecoveries = 0;
    let mediaRecoveries = 0;

    setStatus('loading');
    setMessage(null);

    const fail = (msg: string) => {
      if (!cancelled) {
        setStatus('error');
        setMessage(msg);
      }
    };

    if (streamUrl === null) {
      fail('URL du flux invalide.');
      return;
    }

    // Garde conteneur : inutile de tenter la lecture d'un format que le
    // navigateur ne decode pas — message clair immediat (pas un faux "erreur reseau").
    const badContainer = unsupportedContainer(src);
    if (badContainer !== null && !live && !TRANSCODE_GATEWAY) {
      fail(
        `Format ${badContainer} non lisible dans un navigateur (transcodage requis). ` +
          'Les films .mp4 et le Live se lisent normalement.',
      );
      return;
    }

    const sendProgress = (force: boolean) => {
      if (liveRef.current) return;
      const now = Date.now();
      if (!force && now - lastSentRef.current < PROGRESS_INTERVAL_MS) return;
      lastSentRef.current = now;
      const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null;
      onProgressRef.current?.(video.currentTime, duration);
    };

    const handleLoadedMetadata = () => {
      if (!liveRef.current && startAtRef.current > 0 && startAtRef.current < video.duration - 5) {
        video.currentTime = startAtRef.current;
      }
    };
    const handleReady = () => {
      if (!cancelled) setStatus('ready');
    };
    const handleTimeUpdate = () => sendProgress(false);
    const handlePause = () => sendProgress(true);
    const handleEnded = () => {
      sendProgress(true);
      onEndedRef.current?.();
    };
    const handleError = () => {
      fail(
        'Flux indisponible : connexion refusée par le serveur (CDN anti-datacenter ou limite de connexions) ' +
          'ou flux hors service. Réessaie, ou teste un autre flux.',
      );
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('canplay', handleReady);
    video.addEventListener('playing', handleReady);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('pause', handlePause);
    video.addEventListener('ended', handleEnded);
    video.addEventListener('error', handleError);

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
            fail('Lecture HLS non supportée par ce navigateur.');
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
              hls.startLoad();
              return;
            }
            if (data.type === HlsCtor.ErrorTypes.MEDIA_ERROR && mediaRecoveries < 1) {
              mediaRecoveries += 1;
              hls.recoverMediaError();
              return;
            }
            fail('Erreur HLS fatale. Verifiez HTTPS, CORS et la disponibilite du flux.');
          });
          hls.loadSource(streamUrl);
          hls.attachMedia(video);
        } catch {
          fail('Impossible de charger le module de lecture HLS.');
          return;
        }
      }
      void video.play().catch(() => {
        // Autoplay bloque : l'utilisateur lancera la lecture manuellement.
      });
    };
    void setup();

    return () => {
      cancelled = true;
      sendProgress(true); // flush du timestamp a la sortie
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('canplay', handleReady);
      video.removeEventListener('playing', handleReady);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('ended', handleEnded);
      video.removeEventListener('error', handleError);
      if (hlsRef.current !== null) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      video.removeAttribute('src');
      video.load();
    };
  }, [streamUrl, attempt]);

  return (
    <div className={cn('relative overflow-hidden rounded-2xl bg-black', className)}>
      <video
        ref={videoRef}
        controls
        playsInline
        autoPlay
        poster={posterUrl ?? undefined}
        className="aspect-video w-full bg-black"
      />
      {status === 'loading' && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/40">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-ink-500 border-t-accent" />
        </div>
      )}
      {status === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/85 px-6 text-center">
          <p className="text-sm leading-relaxed text-fg">{message}</p>
          <Button size="sm" variant="secondary" onClick={() => setAttempt((a) => a + 1)}>
            Réessayer
          </Button>
        </div>
      )}
    </div>
  );
}
