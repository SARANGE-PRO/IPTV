import { noteStarvation } from '@/services/player/networkQualityService';
import { bufferedAhead, isSeekable } from '@/services/player/playbackCapabilityService';
import { wasPausedByUser } from '@/services/player/playbackIntent';
import { PLAYBACK_MESSAGES as MESSAGES, unsupportedContainer } from '@/services/player/playbackMessages';
import {
  AUTO_RESUME_POKE_MS,
  autoResumeTimeout,
  canAutoResume,
  HEALTHY_RESET_MS,
  isStarvedPause,
  LIVE_REJOIN_AFTER_MS,
  recoveryBudget,
  retryDelay,
  STARTUP_GRACE_MS,
  stallTimeout,
  startupTimeout,
  WATCHDOG_INTERVAL_MS,
  type RecoveryReason,
  type StreamKind,
} from '@/services/player/playbackRecoveryPolicy';
import { isInPip } from '@/services/player/pictureInPicture';
import { createProgressTracker, type PositionMemo, type ProgressSink } from '@/services/player/progressTracker';
import { createStreamSource } from '@/services/player/streamSource';
import type { PreferredLanguage } from '@/types/mediaLanguage';
import type { PlaybackFailure } from '@/types/playbackDiagnostics';
import { mediaGatewayStopUrl } from '@/utils/secureUrl';

/**
 * Supervision d'UN flux sur la <video> du lecteur unique (sortie de
 * VideoPlayer pour etre testee : tests/playbackSession.test.ts).
 *
 * Les echecs transitoires (zapping sur un compte a connexion unique, direct
 * qui se fige, reseau mobile) sont relances selon `playbackRecoveryPolicy` ;
 * l'echec DEFINITIF (`onFailure`) n'arrive qu'en dernier recours.
 *
 * loading      : premier demarrage du flux (spinner).
 * ready        : lecture ou pause — rien par-dessus la video (lecteur natif).
 * reconnecting : relance automatique en cours (spinner + mention).
 * buffering    : pause imposee par le systeme (tampon vide) — reprise seule.
 * offline      : reseau coupe — la lecture reprendra seule a son retour.
 * error        : echec definitif (Reessayer / diagnostic).
 */
export type PlayerPhase = 'loading' | 'ready' | 'reconnecting' | 'buffering' | 'offline' | 'error';
export type PhaseUpdate = PlayerPhase | ((current: PlayerPhase) => PlayerPhase);

export interface PlaybackSessionOptions {
  /** URL finale du flux (secureMediaUrl) ; null = invalide. */
  url: string | null;
  /** URL d'origine (conteneur, arret de session passerelle). */
  rawSrc: string;
  live: boolean;
  startOffset: number;
  transcode: boolean;
  preferHls: boolean;
  directMkv: boolean;
  /** Valeurs COURANTES de la page (relues a chaque usage). */
  startAt: () => number;
  duration: () => number | null;
  preferredLanguage: () => PreferredLanguage;
  progressSink: () => ProgressSink | undefined;
  memo: PositionMemo;
}

export interface PlaybackSessionEvents {
  setPhase: (update: PhaseUpdate) => void;
  setLimitedSeek: (limited: boolean) => void;
  /** Echec DEFINITIF (relances epuisees ou inutiles). */
  onFailure: (failure: PlaybackFailure) => void;
  /** La lecture (re)demarre. */
  onPlaying: () => void;
  onEnded: () => void;
  onDirectMkvFailed: () => void;
}

const isOffline = (): boolean => typeof navigator !== 'undefined' && navigator.onLine === false;

/** Lance et supervise le flux ; renvoie le nettoyage (fin du flux). */
export function startPlaybackSession(
  video: HTMLVideoElement,
  options: PlaybackSessionOptions,
  events: PlaybackSessionEvents,
): () => void {
  const { setPhase } = events;
  // Instantane de CE flux : au zapping, la meme <video> passe au flux suivant.
  const kind: StreamKind = options.live ? 'live' : 'vod';
  const baseOffset = options.startOffset;
  // Relance automatique : direct, et VOD lue telle quelle. Les flux transcodes
  // / remuxes (offset serveur, HLS passerelle, MKV direct) gardent l'echec
  // explicite : les relancer les ferait repartir de leur debut.
  const autoRecover =
    kind === 'live' || (!options.transcode && !options.preferHls && !options.directMkv && baseOffset === 0);

  let cancelled = false;
  /** A joue depuis le dernier (re)chargement : position et seekability fiables. */
  let started = false;
  /** Le lecteur a ete arrete definitivement (ecran d'erreur). */
  let failed = false;
  let retries = 0;
  let recoveryPending = false;
  let waitingForNetwork = false;
  let awaitingGesture = false;
  let sawLife = false;
  let graceUsed = false;
  let lastTime = -1;
  let lastProgressAt = Date.now();
  let healthySince = Date.now();
  /** Direct mis en pause (ou suspendu en arriere-plan) depuis... */
  let pausedAt: number | null = null;
  /** Manque de donnees signale (`waiting`) et pas encore resolu (`playing`). */
  let starving = false;
  /** En pause SUBIE (tampon vide) : le lecteur relancera seul. */
  let autoPaused = false;
  /** Debut de l'incident de pauses subies (survit aux relances de `play()`). */
  let autoPausedAt: number | null = null;
  let lastPokeAt = 0;
  let startupTimer: ReturnType<typeof setTimeout> | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  /** Derniere cause de relance (diagnostic : « apres N relances sur gel »...). */
  let lastReason: RecoveryReason | null = null;

  setPhase('loading');
  events.setLimitedSeek(false);

  const clearStartupTimer = () => {
    if (startupTimer !== null) {
      clearTimeout(startupTimer);
      startupTimer = null;
    }
  };
  const clearRetryTimer = () => {
    if (retryTimer !== null) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  };

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
    events.onFailure(final);
  };

  const url = options.url;
  if (url === null) {
    fail({ code: 'invalid_url', message: 'URL du flux invalide.' });
    return () => {
      cancelled = true;
    };
  }

  // Garde conteneur : inutile de tenter la lecture d'un format que le
  // navigateur ne decode pas — message clair immediat (pas un faux "erreur reseau").
  const badContainer = unsupportedContainer(options.rawSrc);
  if (badContainer !== null && kind === 'vod' && !options.transcode && !options.directMkv) {
    fail({
      code: 'unsupported_container',
      message:
        `Format ${badContainer} non lisible dans un navigateur (transcodage requis). ` +
        'Les films .mp4 et le Live se lisent normalement.',
      detail: badContainer,
    });
    return () => {
      cancelled = true;
    };
  }

  const progress = createProgressTracker({
    video,
    kind,
    url,
    baseOffset,
    started: () => started,
    sink: options.progressSink,
    duration: options.duration,
    startAt: options.startAt,
    memo: options.memo,
    onLimitedSeek: events.setLimitedSeek,
  });

  // --- Demarrage, relances -------------------------------------------------

  // `recover` est defini plus bas (la source le rappelle sur HLS fatal).
  const source = createStreamSource(video, {
    url,
    kind,
    directMkv: options.directMkv,
    preferredLanguage: options.preferredLanguage,
    onRecoverableError: (f) => recover('error', f),
    onFatal: fail,
    onDirectMkvFailed: events.onDirectMkvFailed,
    onAutoplayBlocked: () => {
      // Autoplay refuse (aucun geste) : on retire le spinner, le bouton lecture
      // natif reste disponible ; la garde de demarrage repartira au tap.
      awaitingGesture = true;
      clearStartupTimer();
      setPhase((p) => (p === 'error' ? p : 'ready'));
    },
  });

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
    // Une relance deja programmee ferait recharger une 2e fois.
    clearRetryTimer();
    recoveryPending = false;
    started = false;
    progress.resetResume();
    awaitingGesture = false;
    pausedAt = null;
    starving = false;
    autoPaused = false;
    autoPausedAt = null;
    lastTime = -1;
    lastProgressAt = Date.now();
    source.detach();
    armStartupTimer();
    void source.attach();
  };

  function recover(reason: RecoveryReason, f: PlaybackFailure): void {
    if (cancelled || failed || recoveryPending || waitingForNetwork) return;
    clearStartupTimer();
    // VOD deja lancee mais non seekable : la recharger la ferait repartir du
    // debut sans pouvoir revenir a la position -> echec explicite.
    if (!autoRecover || (kind === 'vod' && started && !isSeekable(video))) {
      fail(f);
      return;
    }
    if (isOffline()) {
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
  }

  // --- Evenements media ----------------------------------------------------

  const markLife = () => {
    sawLife = true;
  };
  const handleLoadedMetadata = () => {
    sawLife = true;
    progress.evaluateSeek();
  };
  const handleCanPlay = () => {
    sawLife = true;
    progress.evaluateSeek();
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
    starving = false;
    autoPaused = false;
    autoPausedAt = null;
    healthySince = Date.now();
    lastProgressAt = healthySince;
    lastTime = video.currentTime;
    setPhase('ready');
    progress.evaluateSeek();
    events.onPlaying();
  };
  const handleTimeUpdate = () => {
    const t = video.currentTime;
    if (t !== lastTime) {
      lastTime = t;
      lastProgressAt = Date.now();
    }
    progress.remember();
    progress.send(false);
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
    autoPaused = false;
  };
  const handleWaiting = () => {
    if (started) starving = true;
  };
  const handlePause = () => {
    progress.send(true);
    if (cancelled || failed || !started || video.ended || video.seeking) return;
    // Pause SUBIE : Safari iOS suspend la lecture quand le tampon se vide sur
    // un reseau faible. Ce n'est pas l'utilisateur -> on relancera seul.
    const starved =
      (document.visibilityState === 'visible' || isInPip(video)) &&
      !wasPausedByUser(video) &&
      isStarvedPause({ bufferAhead: bufferedAhead(video), readyState: video.readyState, starving });
    if (starved) {
      noteStarvation();
      autoPaused = true;
      if (autoPausedAt === null) autoPausedAt = Date.now();
      lastPokeAt = Date.now();
      setPhase((p) => (p === 'ready' ? 'buffering' : p));
      return;
    }
    autoPausedAt = null;
    if (kind === 'live' && pausedAt === null) pausedAt = Date.now();
  };
  const handleEnded = () => {
    // Un direct ne « finit » pas : le serveur a coupe -> on rouvre.
    if (kind === 'live') {
      recover('ended', { code: 'live_ended', message: MESSAGES.liveEnded });
      return;
    }
    progress.send(true);
    events.onEnded();
  };
  const handleError = () => {
    // Erreur residuelle d'une source deja retiree (rechargement) : ignoree.
    if (cancelled || video.getAttribute('src') === null) return;
    recover('error', { code: 'native_error', message: MESSAGES.native[kind], mediaErrorCode: video.error?.code ?? null });
  };

  const mediaListeners: [string, () => void][] = [
    ['loadedmetadata', handleLoadedMetadata],
    ['loadeddata', markLife],
    ['progress', markLife],
    ['canplay', handleCanPlay],
    ['playing', handlePlaying],
    ['timeupdate', handleTimeUpdate],
    ['play', handlePlay],
    ['pause', handlePause],
    ['waiting', handleWaiting],
    ['ended', handleEnded],
    ['error', handleError],
  ];
  for (const [type, listener] of mediaListeners) video.addEventListener(type, listener);

  // --- Reseau ----------------------------------------------------------------

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

  // --- Chien de garde anti-gel ---------------------------------------------

  /** Pause subie : relance des que le tampon s'est reconstitue, sinon rechargement. */
  const tickAutoResume = (now: number) => {
    lastProgressAt = now;
    if (!video.paused) {
      autoPaused = false;
      return;
    }
    if (isOffline() || now - (autoPausedAt ?? now) >= autoResumeTimeout(kind)) {
      autoPaused = false;
      autoPausedAt = null;
      // Rechargeable : le direct est rejoint, la VOD reprend a sa position ;
      // sinon on rend la main (bouton lecture natif), comme avant.
      if (autoRecover && !(kind === 'vod' && !isSeekable(video))) {
        recover('stall', { code: 'stream_stalled', message: MESSAGES.stalled[kind] });
      } else {
        setPhase((p) => (p === 'buffering' ? 'ready' : p));
      }
      return;
    }
    if (!canAutoResume(kind, bufferedAhead(video), video.readyState) && now - lastPokeAt < AUTO_RESUME_POKE_MS) return;
    lastPokeAt = now;
    void video.play().catch((err: unknown) => {
      // Lecture sans geste refusee : on rend la main au bouton natif.
      if (cancelled || (err as { name?: string } | null)?.name !== 'NotAllowedError') return;
      autoPaused = false;
      autoPausedAt = null;
      setPhase((p) => (p === 'buffering' ? 'ready' : p));
    });
  };

  const watchdog = setInterval(() => {
    const now = Date.now();
    // Reseau revenu sans evenement `online` (PWA gelee en arriere-plan) :
    // sans ce rattrapage, « Connexion perdue » resterait affiche.
    if (waitingForNetwork && !isOffline()) {
      handleOnline();
      return;
    }
    const hiddenWithoutPip = document.visibilityState === 'hidden' && !isInPip(video);
    if (autoPaused && !cancelled && !failed && !recoveryPending && !waitingForNetwork && !hiddenWithoutPip) {
      tickAutoResume(now);
      return;
    }
    if (cancelled || failed || recoveryPending || waitingForNetwork || !started || video.paused || video.ended || hiddenWithoutPip) {
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
      noteStarvation();
      recover('stall', { code: 'stream_stalled', message: MESSAGES.stalled[kind] });
    }
  }, WATCHDOG_INTERVAL_MS);

  // --- Arriere-plan, fermeture -----------------------------------------------

  // ANTI-BAN (compte Xtream a connexion unique) : a la fermeture d'un flux HLS
  // VOD, on demande a la passerelle de tuer ffmpeg TOUT DE SUITE (sinon la
  // connexion amont reste ouverte jusqu'a l'idle). sendBeacon survit a la
  // navigation/fermeture. Envoye une seule fois par flux.
  let hlsStopped = false;
  const stopHlsSession = () => {
    if (hlsStopped || !options.preferHls) return;
    const stopUrl = mediaGatewayStopUrl(options.rawSrc);
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
    progress.send(true);
    stopHlsSession();
  };
  const handleVisibility = () => {
    if (document.visibilityState === 'hidden') {
      // Image dans l'image : la video reste regardee, rien n'est suspendu.
      if (isInPip(video)) return;
      progress.send(true);
      // iOS suspend la video de la PWA en arriere-plan (sans PiP) : on date
      // la « pause » pour rejoindre le direct a la reprise.
      if (kind === 'live' && started && !video.paused && pausedAt === null) pausedAt = Date.now();
      // Pause subie en cours : on n'insiste pas en arriere-plan ; elle devient
      // une pause ordinaire (le direct sera rejoint a la reprise si besoin).
      if (autoPaused) {
        autoPaused = false;
        if (kind === 'live' && pausedAt === null) pausedAt = autoPausedAt ?? Date.now();
        autoPausedAt = null;
        setPhase((p) => (p === 'buffering' ? 'ready' : p));
      }
      return;
    }
    // Retour au premier plan : le JS etait gele, pas de faux gel.
    lastProgressAt = Date.now();
    if (!video.paused) pausedAt = null; // PiP/AirPlay : le direct a continue
  };
  window.addEventListener('pagehide', flushProgress);
  document.addEventListener('visibilitychange', handleVisibility);

  armStartupTimer();
  void source.attach();

  return () => {
    cancelled = true;
    clearStartupTimer();
    clearRetryTimer();
    clearInterval(watchdog);
    progress.send(true, true); // derniere position -> l'ancien titre
    for (const [type, listener] of mediaListeners) video.removeEventListener(type, listener);
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('pagehide', flushProgress);
    document.removeEventListener('visibilitychange', handleVisibility);
    // ... ni une session ffmpeg (connexion Xtream) ouverte cote passerelle.
    stopHlsSession();
    source.dispose();
  };
}
