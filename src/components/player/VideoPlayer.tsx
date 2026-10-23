'use client';

import type Hls from 'hls.js';
import { useEffect, useRef, useState } from 'react';
import { PlaybackErrorInfo } from '@/components/player/PlaybackErrorInfo';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { nativeDurationSeconds } from '@/services/player/mediaDurationService';
import { isSeekable } from '@/services/player/playbackCapabilityService';
import {
  HEALTHY_RESET_MS,
  LIVE_REJOIN_AFTER_MS,
  recoveryBudget,
  resumePosition,
  retryDelay,
  STARTUP_GRACE_MS,
  stallTimeout,
  startupTimeout,
  WATCHDOG_INTERVAL_MS,
  type RecoveryReason,
  type StreamKind,
} from '@/services/player/playbackRecoveryPolicy';
import { useUiSettingsStore } from '@/stores/uiSettingsStore';
import type { PlaybackErrorCode, PlaybackFailure } from '@/types/playbackDiagnostics';
import type { MkvDirectEngine } from '@/services/player/mkvDirectEngine';
import type { MkvDirectErrorCode } from '@/types/mkvDirect';
import { mediaGatewayStopUrl, secureImageSrc, secureMediaUrl } from '@/utils/secureUrl';

/**
 * Lecteur video isole. HLS natif (Safari iOS/iPadOS) prioritaire ; hls.js
 * charge en lazy uniquement si necessaire. URLs directes vers le serveur
 * Xtream — jamais via Vercel, jamais en cache service worker.
 *
 * La MEME <video> sert a tous les flux successifs (zapping, episode suivant) :
 * iOS n'autorise la lecture avec son qu'apres un geste SUR l'element — un
 * nouvel element a chaque chaine pourrait exiger un nouveau tap.
 *
 * Supervision : les echecs transitoires (zapping sur un compte a connexion
 * unique, direct qui se fige, reseau mobile) sont relances automatiquement
 * selon `playbackRecoveryPolicy` ; l'ecran d'erreur n'apparait qu'en dernier
 * recours.
 */

export interface VideoPlayerProps {
  src: string;
  poster?: string | null;
  live?: boolean;
  /** Reprise par SEEK (flux seekable : MP4 direct). */
  startAt?: number;
  /** Reprise par OFFSET SERVEUR (flux transcode non-seekable) : la passerelle
   *  demarre a cette position, le flux commence donc a `startOffset`. Le lecteur
   *  ne seek pas et rapporte la progression decalee de cet offset. */
  startOffset?: number;
  /** Duree totale de repli (Xtream/TMDB) quand le player n'expose pas de duree. */
  duration?: number | null;
  /** `force` = flush garanti (pause/fin/pagehide/demontage) : la page doit le
   * relayer a saveProgress pour contourner le throttle, sinon la derniere
   * position est perdue quand iOS gele la PWA en arriere-plan. */
  onProgress?: (positionSec: number, durationSec: number | null, force: boolean) => void;
  onEnded?: () => void;
  /** Echec DEFINITIF (relances automatiques epuisees) : repli VLC, autre version. */
  onError?: (failure: PlaybackFailure) => void;
  /** La lecture (re)demarre : efface un echec signale auparavant. */
  onPlaying?: () => void;
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
  /**
   * MKV lu DIRECTEMENT dans le navigateur (coquille HTTP) : fetch depuis
   * l'appareil, remux fMP4 in-app, MediaSource. Decide par la page
   * (plan 'direct-mkv'). Jamais via la passerelle.
   */
  directMkv?: boolean;
  /** Appele si le remux direct echoue (codecs non lus, CORS, MSE) : la page
   *  retombe sur passerelle/VLC. */
  onDirectMkvFailed?: () => void;
  /** Contexte pour le diagnostic d'erreur (bouton "i"). */
  contentType?: 'live' | 'vod' | 'episode';
  container?: string | null;
  /** Classes du cadre (fond noir arrondi qui contient la video). */
  className?: string;
  /** Classes du conteneur racine (cadre + mentions sous le lecteur). */
  rootClassName?: string;
  /** Classes ajoutees a la <video> (ex. remplir l'ecran en paysage). */
  videoClassName?: string;
  /** Recoit l'element <video> au montage (null au demontage) : commandes
   *  externes comme le plein ecran paysage. */
  onVideoElement?: (video: HTMLVideoElement | null) => void;
  /** Vignette (mini-lecteur) : ni commandes natives, ni panneau d'erreur. */
  compact?: boolean;
}

/**
 * loading      : premier demarrage du flux (spinner).
 * ready        : lecture ou pause — rien par-dessus la video (lecteur natif).
 * reconnecting : relance automatique en cours (spinner + mention).
 * offline      : reseau coupe — la lecture reprendra seule a son retour.
 * error        : echec definitif (Reessayer / diagnostic).
 */
type PlayerPhase = 'loading' | 'ready' | 'reconnecting' | 'offline' | 'error';

/** Safari (iOS surtout) n'expose PAS `pictureInPictureEnabled` : il utilise
 * l'API webkit `webkitSetPresentationMode` (hors typings standard). */
type WebkitVideo = HTMLVideoElement & {
  webkitSupportsPresentationMode?: (mode: string) => boolean;
  webkitSetPresentationMode?: (mode: 'inline' | 'picture-in-picture' | 'fullscreen') => void;
  webkitPresentationMode?: string;
  webkitShowPlaybackTargetPicker?: () => void;
  /** Plein ecran video iOS (le seul fiable en PWA installee — hors typings standard). */
  webkitEnterFullscreen?: () => void;
  /** Auto-PiP declaratif (Chrome 120+, Safari recent) — hors typings standard. */
  autoPictureInPicture?: boolean;
};

function isInPip(video: HTMLVideoElement): boolean {
  if ((video as WebkitVideo).webkitPresentationMode === 'picture-in-picture') return true;
  return typeof document !== 'undefined' && document.pictureInPictureElement === video;
}

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

/** Messages d'echec DEFINITIF (apres les relances automatiques). */
const MESSAGES = {
  timeout: {
    live: 'La chaîne ne démarre pas (serveur lent, chaîne hors service ou limite de connexions). Réessaie ou essaie une autre version.',
    vod: 'La lecture ne démarre pas (serveur lent ou flux indisponible). Réessaie dans un instant.',
  },
  native: {
    live: 'Chaîne illisible pour le moment (chaîne hors service, limite de connexions ou format non lu par cet appareil). Réessaie ou essaie une autre version.',
    vod: 'Lecture impossible : format non lu par cet appareil, flux hors service ou limite de connexions atteinte. Réessaie dans un instant.',
  },
  stalled: {
    live: 'La chaîne s’est figée et ne repart pas (serveur saturé ou limite de connexions). Réessaie ou essaie une autre version.',
    vod: 'La lecture s’est figée et ne repart pas (serveur lent ou connexion instable). Réessaie.',
  },
  liveEnded: 'Le serveur a coupé le direct et ne le rouvre pas. Réessaie ou essaie une autre version.',
} as const;

export function VideoPlayer({
  src,
  poster,
  live = false,
  startAt = 0,
  startOffset = 0,
  duration = null,
  onProgress,
  onEnded,
  onError,
  onPlaying,
  transcode = false,
  preferHls = false,
  directMkv = false,
  onDirectMkvFailed,
  contentType,
  container = null,
  className,
  rootClassName,
  videoClassName,
  onVideoElement,
  compact = false,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const mkvEngineRef = useRef<MkvDirectEngine | null>(null);
  const autoPip = useUiSettingsStore((s) => s.autoPip);
  const preferredLanguage = useUiSettingsStore((s) => s.preferredLanguage);
  const onDirectMkvFailedRef = useRef(onDirectMkvFailed);
  onDirectMkvFailedRef.current = onDirectMkvFailed;
  const [phase, setPhase] = useState<PlayerPhase>('loading');
  const [failure, setFailure] = useState<PlaybackFailure | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [limitedSeek, setLimitedSeek] = useState(false);
  // Flux HTTP -> passerelle HTTPS (Xtream HTTP-only + mixed-content). C'est la
  // passerelle qui choisit passthrough (MP4/segments) ou remux/transcodage
  // (MKV/HEVC, live .ts). Le drapeau `transcode` autorise les conteneurs
  // non-natifs, contextualise le diagnostic (voir plus bas) et, sur une page
  // HTTP (coquille infra/http-shell, lecture directe par defaut), force malgre
  // tout le passage par la passerelle : c'est son transcodage qu'on veut.
  const streamUrl = secureMediaUrl(src, { hls: preferHls, start: startOffset, transcode });
  const posterUrl = secureImageSrc(poster);

  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const onPlayingRef = useRef(onPlaying);
  onPlayingRef.current = onPlaying;
  const startAtRef = useRef(startAt);
  startAtRef.current = startAt;
  const startOffsetRef = useRef(startOffset);
  startOffsetRef.current = startOffset;
  const liveRef = useRef(live);
  liveRef.current = live;
  const durationRef = useRef(duration);
  durationRef.current = duration;
  /** Derniere position VOD connue de CE flux : une relance (auto ou bouton
   *  Reessayer) y reprend au lieu de repartir du point d'ouverture. */
  const lastPositionRef = useRef<{ url: string; position: number } | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (video === null) return;
    // Instantane de CE flux. Au zapping, la meme <video> passe au flux suivant :
    // le nettoyage doit encore rapporter la position a l'ANCIEN titre, alors que
    // les refs pointent deja sur le nouveau.
    const kind: StreamKind = liveRef.current ? 'live' : 'vod';
    const baseOffset = startOffsetRef.current;
    // Relance automatique : direct, et VOD lue telle quelle. Les flux transcodes
    // / remuxes (offset serveur, HLS passerelle, MKV direct) gardent l'echec
    // explicite : les relancer les ferait repartir de leur debut.
    const autoRecover = kind === 'live' || (!transcode && !preferHls && !directMkv && baseOffset === 0);

    let cancelled = false;
    /** A joue depuis le dernier (re)chargement : position et seekability fiables. */
    let started = false;
    /** Le lecteur a ete arrete definitivement (ecran d'erreur). */
    let failed = false;
    let retries = 0;
    let recoveryPending = false;
    let waitingForNetwork = false;
    let awaitingGesture = false;
    let resumed = false;
    let sawLife = false;
    let graceUsed = false;
    let lastSent = 0;
    let lastTime = -1;
    let lastProgressAt = Date.now();
    let healthySince = Date.now();
    /** Direct mis en pause (ou suspendu en arriere-plan) depuis... */
    let pausedAt: number | null = null;
    /** Generation de chargement : un attachement async perime s'abandonne. */
    let generation = 0;
    let progressSink = onProgressRef.current;
    let lastDuration = durationRef.current;
    let startupTimer: ReturnType<typeof setTimeout> | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let hlsTimer: ReturnType<typeof setTimeout> | null = null;

    setPhase('loading');
    setFailure(null);
    setLimitedSeek(false);

    const clearStartupTimer = () => {
      if (startupTimer !== null) {
        clearTimeout(startupTimer);
        startupTimer = null;
      }
    };

    /** Derniere cause de relance (diagnostic : « apres N relances sur gel »...). */
    let lastReason: RecoveryReason | null = null;

    const fail = (f: PlaybackFailure) => {
      clearStartupTimer();
      if (cancelled || failed) return;
      failed = true;
      recoveryPending = false;
      const final: PlaybackFailure =
        retries > 0 && lastReason !== null
          ? { ...f, detail: [f.detail, `${retries} relance(s) auto, derniere sur ${lastReason}`].filter(Boolean).join(' · ') }
          : f;
      setPhase('error');
      setFailure(final);
      onErrorRef.current?.(final);
    };

    if (streamUrl === null) {
      fail({ code: 'invalid_url', message: 'URL du flux invalide.' });
      return;
    }

    // Garde conteneur : inutile de tenter la lecture d'un format que le
    // navigateur ne decode pas — message clair immediat (pas un faux "erreur reseau").
    const badContainer = unsupportedContainer(src);
    if (badContainer !== null && kind === 'vod' && !transcode && !directMkv) {
      fail({
        code: 'unsupported_container',
        message:
          `Format ${badContainer} non lisible dans un navigateur (transcodage requis). ` +
          'Les films .mp4 et le Live se lisent normalement.',
        detail: badContainer,
      });
      return;
    }

    const sendProgress = (force: boolean, final = false) => {
      // Avant le premier `playing`, currentTime vaut encore 0 (ou un seek en
      // cours) : l'envoyer ecraserait la position de reprise enregistree.
      if (kind === 'live' || !started) return;
      const now = Date.now();
      if (!force && now - lastSent < PROGRESS_INTERVAL_MS) return;
      lastSent = now;
      if (!final) {
        progressSink = onProgressRef.current;
        lastDuration = durationRef.current;
      }
      // Reprise par offset serveur : la position reelle = offset + temps du flux,
      // et la duree totale = offset + duree du flux transcode (a defaut, la duree fournie).
      const nat = nativeDurationSeconds(video.duration);
      const effectiveDuration =
        baseOffset > 0 ? (nat !== null ? baseOffset + nat : (lastDuration ?? null)) : (nat ?? lastDuration ?? null);
      progressSink?.(baseOffset + video.currentTime, effectiveDuration, force);
    };

    // Evalue la seekability (lazy) et applique la reprise UNE fois si possible.
    // Appelee a loadedmetadata, canplay et playing (les plages seekable arrivent tard).
    const evaluateSeek = () => {
      if (kind === 'live' || cancelled) return;
      // Reprise par offset serveur : le flux commence deja a la bonne position,
      // aucun seek a faire (et il reste seekable dans sa fenetre transcodee).
      if (baseOffset > 0) {
        setLimitedSeek(false);
        return;
      }
      const seekable = isSeekable(video);
      setLimitedSeek(!seekable);
      const memo = lastPositionRef.current;
      const target = resumePosition(startAtRef.current, memo !== null && memo.url === streamUrl ? memo.position : null);
      if (resumed || !seekable || target <= 0) return;
      const effDur = nativeDurationSeconds(video.duration) ?? durationRef.current;
      if (effDur === null || target < effDur - 5) {
        resumed = true;
        try {
          video.currentTime = target;
        } catch {
          // Le flux refuse le seek : on ne boucle pas, lecture depuis le debut.
        }
      }
    };

    // --- Source ------------------------------------------------------------

    const isHls = /\.m3u8(?:$|[?#])/i.test(streamUrl);
    const canNativeHls = video.canPlayType('application/vnd.apple.mpegurl') !== '';

    const detachSource = () => {
      generation += 1;
      if (hlsTimer !== null) {
        clearTimeout(hlsTimer);
        hlsTimer = null;
      }
      if (hlsRef.current !== null) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      if (mkvEngineRef.current !== null) {
        mkvEngineRef.current.dispose();
        mkvEngineRef.current = null;
        // Le moteur coupe AirPlay (exige par ManagedMediaSource) : la <video>
        // etant reutilisee, on le rend aux flux suivants.
        try {
          (video as HTMLVideoElement & { disableRemotePlayback?: boolean }).disableRemotePlayback = false;
        } catch {
          // propriete absente : sans effet
        }
      }
      video.removeAttribute('src');
      try {
        video.load();
      } catch {
        // element deja vide
      }
    };

    const attachSource = async () => {
      const gen = generation;
      const stale = () => cancelled || gen !== generation;
      if (directMkv) {
        // MKV direct : le moteur alimente MediaSource ; aucune URL ne transite
        // ailleurs que vers le serveur Xtream, depuis l'IP de l'appareil.
        try {
          const mod = await import('@/services/player/mkvDirectEngine');
          if (stale()) return;
          const engine = new mod.MkvDirectEngine({
            url: streamUrl,
            preferredLanguage,
            onFatal: (code: MkvDirectErrorCode, detail: string) => {
              const unsupported = code === 'header' || code === 'no_video' || code === 'unsupported_video' || code === 'unsupported_audio';
              fail({
                code: unsupported ? 'mkv_direct_unsupported' : code === 'network' ? 'mkv_direct_network' : 'mkv_direct_media',
                message: unsupported
                  ? 'Ce MKV contient un format (vidéo ou audio) que cet appareil ne décode pas dans le navigateur.'
                  : code === 'network'
                    ? 'Le flux MKV ne répond plus (réseau, serveur ou limite de connexions). Réessaie.'
                    : 'Le lecteur du navigateur a refusé ce MKV (mémoire ou décodage). Réessaie.',
                detail: `${code}: ${detail}`,
              });
              onDirectMkvFailedRef.current?.();
            },
          });
          mkvEngineRef.current = engine;
          await engine.attach(video);
        } catch {
          fail({ code: 'mkv_direct_media', message: 'Impossible de charger le lecteur MKV direct.' });
          return;
        }
      } else if (!isHls || canNativeHls) {
        // Safari/iOS conserve ainsi son lecteur HLS natif.
        video.src = streamUrl;
      } else {
        try {
          const mod = await import('hls.js');
          const HlsCtor = mod.default;
          if (stale()) return;
          if (!HlsCtor.isSupported()) {
            fail({ code: 'hls_unsupported', message: 'Lecture HLS non supportée par ce navigateur.' });
            return;
          }
          const hls = new HlsCtor({
            enableWorker: true,
            lowLatencyMode: kind === 'live',
            backBufferLength: kind === 'live' ? 30 : 90,
          });
          hlsRef.current = hls;
          let networkRecoveries = 0;
          let mediaRecoveries = 0;
          hls.on(HlsCtor.Events.ERROR, (_event, data) => {
            if (!data.fatal || stale()) return;
            if (data.type === HlsCtor.ErrorTypes.NETWORK_ERROR && networkRecoveries < 2) {
              networkRecoveries += 1;
              // Recharge espacee : un pic reseau temporaire ne doit pas boucler
              // en rafale (backoff simple, annule au nettoyage).
              hlsTimer = setTimeout(() => {
                hlsTimer = null;
                if (!stale()) hls.startLoad();
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
            recover('error', {
              code: hlsCode,
              message: 'Erreur HLS fatale. Vérifiez HTTPS, CORS et la disponibilité du flux.',
              httpStatus,
              detail: data.details ?? null,
            });
          });
          hls.loadSource(streamUrl);
          hls.attachMedia(video);
        } catch {
          fail({ code: 'hls_module_failed', message: 'Impossible de charger le module de lecture HLS.' });
          return;
        }
      }
      if (stale()) return;
      void video.play().catch((err: unknown) => {
        // Autoplay refuse (aucun geste) : on retire le spinner, le bouton lecture
        // natif reste disponible ; la garde de demarrage repartira au tap.
        if (stale() || (err as { name?: string } | null)?.name !== 'NotAllowedError') return;
        awaitingGesture = true;
        clearStartupTimer();
        setPhase((p) => (p === 'error' ? p : 'ready'));
      });
    };

    // --- Demarrage, relances -----------------------------------------------

    // Filet de securite : un flux mort peut n'emettre ni 'canplay' ni 'error'
    // et laisser le spinner tourner indefiniment. On borne l'attente, avec UNE
    // prolongation si le flux donne signe de vie (lent n'est pas mort).
    const armStartupTimer = () => {
      clearStartupTimer();
      sawLife = false;
      graceUsed = false;
      const onTimeout = () => {
        startupTimer = null;
        if (cancelled || started || failed) return;
        if (sawLife && !graceUsed) {
          graceUsed = true;
          startupTimer = setTimeout(onTimeout, STARTUP_GRACE_MS);
          return;
        }
        recover('timeout', { code: 'load_timeout', message: MESSAGES.timeout[kind] });
      };
      startupTimer = setTimeout(onTimeout, startupTimeout(kind, retries));
    };

    const reload = () => {
      if (cancelled || failed) return;
      recoveryPending = false;
      started = false;
      resumed = false;
      awaitingGesture = false;
      pausedAt = null;
      lastTime = -1;
      lastProgressAt = Date.now();
      detachSource();
      armStartupTimer();
      void attachSource();
    };

    const recover = (reason: RecoveryReason, f: PlaybackFailure) => {
      if (cancelled || failed || recoveryPending || waitingForNetwork) return;
      clearStartupTimer();
      // VOD deja lancee mais non seekable : la recharger la ferait repartir du
      // debut sans pouvoir revenir a la position -> echec explicite.
      if (!autoRecover || (kind === 'vod' && started && !isSeekable(video))) {
        fail(f);
        return;
      }
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        // Pas de reseau : inutile de bruler les relances, on attend son retour.
        waitingForNetwork = true;
        setPhase('offline');
        return;
      }
      const delay = retries < recoveryBudget(kind, f.mediaErrorCode ?? null, started) ? retryDelay(kind, retries) : null;
      if (delay === null) {
        fail(f);
        return;
      }
      retries += 1;
      recoveryPending = true;
      lastReason = reason;
      setPhase('reconnecting');
      retryTimer = setTimeout(() => {
        retryTimer = null;
        reload();
      }, delay);
    };

    // --- Evenements media ----------------------------------------------------

    const markLife = () => {
      sawLife = true;
    };
    const handleLoadedMetadata = () => {
      sawLife = true;
      evaluateSeek();
    };
    const handleCanPlay = () => {
      sawLife = true;
      evaluateSeek();
      // Pret mais pas lance (autoplay refuse) : plus de spinner, bouton natif.
      if (video.paused && !started) {
        clearStartupTimer();
        setPhase((p) => (p === 'loading' || p === 'reconnecting' ? 'ready' : p));
      }
    };
    const handlePlaying = () => {
      if (cancelled || failed) return;
      clearStartupTimer();
      awaitingGesture = false;
      started = true;
      healthySince = Date.now();
      lastProgressAt = healthySince;
      lastTime = video.currentTime;
      setPhase('ready');
      evaluateSeek();
      onPlayingRef.current?.();
    };
    const handleTimeUpdate = () => {
      const t = video.currentTime;
      if (t !== lastTime) {
        lastTime = t;
        lastProgressAt = Date.now();
      }
      if (started && kind === 'vod') lastPositionRef.current = { url: streamUrl, position: baseOffset + t };
      sendProgress(false);
    };
    const handlePlay = () => {
      if (cancelled || failed) return;
      // Autoplay refuse puis tap sur le bouton natif : on rearme la garde.
      if (awaitingGesture && !started) {
        awaitingGesture = false;
        setPhase('loading');
        armStartupTimer();
      }
      // Direct repris apres une longue pause : la position est sortie de la
      // fenetre (courte) du serveur -> on recharge pour rejoindre le direct.
      if (kind === 'live' && started && pausedAt !== null && Date.now() - pausedAt >= LIVE_REJOIN_AFTER_MS) {
        pausedAt = null;
        setPhase('reconnecting');
        reload();
        return;
      }
      pausedAt = null;
    };
    const handlePause = () => {
      sendProgress(true);
      if (kind === 'live' && started && pausedAt === null) pausedAt = Date.now();
    };
    const handleEnded = () => {
      // Un direct ne « finit » pas : le serveur a coupe -> on rouvre.
      if (kind === 'live') {
        recover('ended', { code: 'live_ended', message: MESSAGES.liveEnded });
        return;
      }
      sendProgress(true);
      onEndedRef.current?.();
    };
    const handleError = () => {
      // Erreur residuelle d'une source deja retiree (rechargement) : ignoree.
      if (cancelled || video.getAttribute('src') === null) return;
      recover('error', {
        code: 'native_error',
        message: MESSAGES.native[kind],
        mediaErrorCode: video.error?.code ?? null,
      });
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('loadeddata', markLife);
    video.addEventListener('progress', markLife);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('playing', handlePlaying);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('ended', handleEnded);
    video.addEventListener('error', handleError);

    // --- Chien de garde anti-gel -------------------------------------------

    const watchdog = setInterval(() => {
      const now = Date.now();
      const hiddenWithoutPip = document.visibilityState === 'hidden' && !isInPip(video);
      if (
        cancelled ||
        failed ||
        recoveryPending ||
        waitingForNetwork ||
        !started ||
        video.paused ||
        video.ended ||
        hiddenWithoutPip
      ) {
        lastProgressAt = now;
        return;
      }
      const t = video.currentTime;
      if (t !== lastTime) {
        lastTime = t;
        lastProgressAt = now;
      }
      // Assez longtemps sans accroc : l'incident est clos.
      if (retries > 0 && now - healthySince >= HEALTHY_RESET_MS && now - lastProgressAt < 2 * WATCHDOG_INTERVAL_MS) {
        retries = 0;
      }
      if (now - lastProgressAt >= stallTimeout(kind, video.seeking)) {
        recover('stall', { code: 'stream_stalled', message: MESSAGES.stalled[kind] });
      }
    }, WATCHDOG_INTERVAL_MS);

    // --- Reseau, arriere-plan, fermeture -------------------------------------

    const handleOnline = () => {
      if (cancelled || !waitingForNetwork) return;
      waitingForNetwork = false;
      recoveryPending = true;
      setPhase('reconnecting');
      // Petite marge : l'interface reseau n'est pas toujours prete a 'online'.
      retryTimer = setTimeout(() => {
        retryTimer = null;
        reload();
      }, 600);
    };
    window.addEventListener('online', handleOnline);

    // ANTI-BAN (compte Xtream a connexion unique) : a la fermeture d'un flux HLS
    // VOD, on demande a la passerelle de tuer ffmpeg TOUT DE SUITE (sinon la
    // connexion amont reste ouverte jusqu'a l'idle). sendBeacon survit a la
    // navigation/fermeture. Envoye une seule fois par flux.
    let hlsStopped = false;
    const stopHlsSession = () => {
      if (hlsStopped || !preferHls) return;
      const stopUrl = mediaGatewayStopUrl(src);
      if (stopUrl !== null && typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        hlsStopped = true;
        try {
          navigator.sendBeacon(stopUrl);
        } catch {
          // beacon indisponible : l'idle passerelle prendra le relais
        }
      }
    };

    // Flush robuste de la progression + arret HLS : fermeture/retour d'onglet, navigation.
    const flushProgress = () => {
      sendProgress(true);
      stopHlsSession();
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        sendProgress(true);
        // iOS suspend la video de la PWA en arriere-plan (sans PiP) : on date
        // la « pause » pour rejoindre le direct a la reprise.
        if (kind === 'live' && started && !video.paused && pausedAt === null) pausedAt = Date.now();
        return;
      }
      // Retour au premier plan : le JS etait gele, pas de faux gel.
      lastProgressAt = Date.now();
      if (!video.paused) pausedAt = null; // PiP/AirPlay : le direct a continue
    };
    window.addEventListener('pagehide', flushProgress);
    document.addEventListener('visibilitychange', handleVisibility);

    armStartupTimer();
    void attachSource();

    return () => {
      cancelled = true;
      clearStartupTimer();
      if (retryTimer !== null) clearTimeout(retryTimer);
      clearInterval(watchdog);
      sendProgress(true, true); // derniere position -> l'ancien titre
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('loadeddata', markLife);
      video.removeEventListener('progress', markLife);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('ended', handleEnded);
      video.removeEventListener('error', handleError);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('pagehide', flushProgress);
      document.removeEventListener('visibilitychange', handleVisibility);
      // ... ni une session ffmpeg (connexion Xtream) ouverte cote passerelle.
      stopHlsSession();
      detachSource();
    };
  }, [streamUrl, attempt, directMkv, preferredLanguage]);

  // Expose la <video> (stable sur toute la vie du composant, zapping compris).
  useEffect(() => {
    if (onVideoElement === undefined) return;
    onVideoElement(videoRef.current);
    return () => onVideoElement(null);
  }, [onVideoElement]);

  // Fin de la lecture (lecteur demonte) : pas de fenetre PiP orpheline
  // pointant sur une <video> detruite. Au zapping, le PiP suit le nouveau flux.
  useEffect(() => {
    const video = videoRef.current;
    return () => {
      if (video !== null) exitPipFor(video);
    };
  }, []);

  // Incrustation AUTO (PiP) quand la PWA passe en arriere-plan pendant la lecture
  // — comme YouTube. Declaratif (autoPictureInPicture) quand supporte + tentative
  // programmatique en secours (silencieuse si un geste est requis par le nav).
  useEffect(() => {
    const video = videoRef.current as WebkitVideo | null;
    if (video === null) return;
    try {
      if ('autoPictureInPicture' in video) video.autoPictureInPicture = autoPip;
    } catch {
      // propriete non inscriptible sur ce navigateur
    }
    if (!autoPip) return;
    const enterPip = () => {
      if (document.visibilityState !== 'hidden' || video.paused || video.ended) return;
      try {
        if (typeof video.webkitSetPresentationMode === 'function' && document.pictureInPictureEnabled !== true) {
          if (video.webkitPresentationMode !== 'picture-in-picture') {
            video.webkitSetPresentationMode('picture-in-picture');
          }
          return;
        }
        if (document.pictureInPictureElement === null && typeof video.requestPictureInPicture === 'function') {
          void video.requestPictureInPicture().catch(() => {});
        }
      } catch {
        // PiP refuse (geste requis) : le mode declaratif prend le relais si dispo
      }
    };
    document.addEventListener('visibilitychange', enterPip);
    return () => document.removeEventListener('visibilitychange', enterPip);
  }, [autoPip]);

  const busy = phase === 'loading' || phase === 'reconnecting';

  return (
    <div className={rootClassName}>
      <div className={cn('relative overflow-hidden rounded-2xl bg-black', className)}>
        <video
          ref={videoRef}
          controls={!compact}
          playsInline
          autoPlay
          poster={posterUrl ?? undefined}
          className={cn('aspect-video w-full bg-black', videoClassName)}
        />
        {busy && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/40">
            <span
              className={cn(
                'animate-spin rounded-full border-2 border-ink-500 border-t-accent',
                compact ? 'h-4 w-4' : 'h-8 w-8',
              )}
            />
            {phase === 'reconnecting' && !compact && (
              <span className="text-xs font-medium text-fg-muted">Reconnexion…</span>
            )}
          </div>
        )}
        {phase === 'offline' && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/75 px-6 text-center">
            {compact ? (
              <span className="text-[10px] font-medium text-fg-muted">Hors ligne</span>
            ) : (
              <>
                <p className="text-sm font-medium text-fg">Connexion perdue</p>
                <p className="text-xs text-fg-muted">La lecture reprendra dès le retour du réseau.</p>
              </>
            )}
          </div>
        )}
        {phase === 'error' && compact && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/80">
            <span className="text-base font-semibold text-accent" aria-hidden>
              !
            </span>
          </div>
        )}
        {phase === 'error' && !compact && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 overflow-y-auto bg-black/85 px-6 py-6 text-center">
            <p className="text-sm leading-relaxed text-fg">{failure?.message}</p>
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
      {limitedSeek && !live && !compact && phase !== 'error' && (
        <p className="mt-2 text-[11px] text-fg-faint">
          Ce flux ne permet pas toujours une reprise précise (lecture progressive).
        </p>
      )}
    </div>
  );
}
