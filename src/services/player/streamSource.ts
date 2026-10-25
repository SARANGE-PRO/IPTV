import type Hls from 'hls.js';
import type { MkvDirectEngine } from '@/services/player/mkvDirectEngine';
import type { StreamKind } from '@/services/player/playbackRecoveryPolicy';
import type { PreferredLanguage } from '@/types/mediaLanguage';
import type { MkvDirectErrorCode } from '@/types/mkvDirect';
import type { PlaybackErrorCode, PlaybackFailure } from '@/types/playbackDiagnostics';

/**
 * Branchement d'UN flux sur la <video> : HLS natif (Safari) ou progressif,
 * hls.js (charge a la demande) ailleurs, moteur MKV direct (remux in-app).
 * URLs directes vers le serveur Xtream — jamais via Vercel.
 *
 * Une GENERATION invalide tout attachement asynchrone perime (rechargement ou
 * fin du flux pendant un `import()`).
 */

export interface StreamSourceOptions {
  url: string;
  kind: StreamKind;
  directMkv: boolean;
  /** Piste audio du MKV direct : lue a chaque attachement (pas de rechargement). */
  preferredLanguage: () => PreferredLanguage;
  /** Erreur que la supervision peut relancer (HLS fatal). */
  onRecoverableError: (failure: PlaybackFailure) => void;
  /** Echec definitif (format illisible, module indisponible). */
  onFatal: (failure: PlaybackFailure) => void;
  /** Remux MKV direct en echec : la page retombe sur passerelle/VLC. */
  onDirectMkvFailed: () => void;
  /** `play()` refuse faute de geste (autoplay) : le bouton natif prend le relais. */
  onAutoplayBlocked: () => void;
}

export interface StreamSource {
  /** (Re)branche le flux puis lance la lecture. */
  attach: () => Promise<void>;
  /** Debranche (hls.js detruit, moteur MKV libere, src retiree). */
  detach: () => void;
  /** Fin du flux : plus aucun rappel, source debranchee. */
  dispose: () => void;
}

export function createStreamSource(video: HTMLVideoElement, opts: StreamSourceOptions): StreamSource {
  const isHls = /\.m3u8(?:$|[?#])/i.test(opts.url);
  const canNativeHls = video.canPlayType('application/vnd.apple.mpegurl') !== '';
  let disposed = false;
  let generation = 0;
  let hls: Hls | null = null;
  let mkvEngine: MkvDirectEngine | null = null;
  let hlsTimer: ReturnType<typeof setTimeout> | null = null;

  const detach = () => {
    generation += 1;
    if (hlsTimer !== null) {
      clearTimeout(hlsTimer);
      hlsTimer = null;
    }
    if (hls !== null) {
      hls.destroy();
      hls = null;
    }
    if (mkvEngine !== null) {
      mkvEngine.dispose();
      mkvEngine = null;
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

  const attachMkv = async (stale: () => boolean): Promise<boolean> => {
    // MKV direct : le moteur alimente MediaSource ; aucune URL ne transite
    // ailleurs que vers le serveur Xtream, depuis l'IP de l'appareil.
    try {
      const mod = await import('@/services/player/mkvDirectEngine');
      if (stale()) return false;
      const engine = new mod.MkvDirectEngine({
        url: opts.url,
        preferredLanguage: opts.preferredLanguage(),
        onFatal: (code: MkvDirectErrorCode, detail: string) => {
          const unsupported =
            code === 'header' || code === 'no_video' || code === 'unsupported_video' || code === 'unsupported_audio';
          opts.onFatal({
            code: unsupported ? 'mkv_direct_unsupported' : code === 'network' ? 'mkv_direct_network' : 'mkv_direct_media',
            message: unsupported
              ? 'Ce MKV contient un format (vidéo ou audio) que cet appareil ne décode pas dans le navigateur.'
              : code === 'network'
                ? 'Le flux MKV ne répond plus (réseau, serveur ou limite de connexions). Réessaie.'
                : 'Le lecteur du navigateur a refusé ce MKV (mémoire ou décodage). Réessaie.',
            detail: `${code}: ${detail}`,
          });
          opts.onDirectMkvFailed();
        },
      });
      mkvEngine = engine;
      await engine.attach(video);
      return true;
    } catch {
      opts.onFatal({ code: 'mkv_direct_media', message: 'Impossible de charger le lecteur MKV direct.' });
      return false;
    }
  };

  const attachHlsJs = async (stale: () => boolean): Promise<boolean> => {
    try {
      const mod = await import('hls.js');
      const HlsCtor = mod.default;
      if (stale()) return false;
      if (!HlsCtor.isSupported()) {
        opts.onFatal({ code: 'hls_unsupported', message: 'Lecture HLS non supportée par ce navigateur.' });
        return false;
      }
      const instance = new HlsCtor({
        enableWorker: true,
        lowLatencyMode: opts.kind === 'live',
        backBufferLength: opts.kind === 'live' ? 30 : 90,
      });
      hls = instance;
      let networkRecoveries = 0;
      let mediaRecoveries = 0;
      instance.on(HlsCtor.Events.ERROR, (_event, data) => {
        if (!data.fatal || stale()) return;
        if (data.type === HlsCtor.ErrorTypes.NETWORK_ERROR && networkRecoveries < 2) {
          networkRecoveries += 1;
          // Recharge espacee : un pic reseau temporaire ne doit pas boucler en
          // rafale (backoff simple, annule au debranchement).
          if (hlsTimer !== null) clearTimeout(hlsTimer);
          hlsTimer = setTimeout(() => {
            hlsTimer = null;
            if (!stale()) instance.startLoad();
          }, 600 * networkRecoveries);
          return;
        }
        if (data.type === HlsCtor.ErrorTypes.MEDIA_ERROR && mediaRecoveries < 1) {
          mediaRecoveries += 1;
          instance.recoverMediaError();
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
        opts.onRecoverableError({
          code: hlsCode,
          message: 'Erreur HLS fatale. Vérifiez HTTPS, CORS et la disponibilité du flux.',
          httpStatus,
          detail: data.details ?? null,
        });
      });
      instance.loadSource(opts.url);
      instance.attachMedia(video);
      return true;
    } catch {
      opts.onFatal({ code: 'hls_module_failed', message: 'Impossible de charger le module de lecture HLS.' });
      return false;
    }
  };

  const attach = async () => {
    const gen = generation;
    const stale = () => disposed || gen !== generation;
    if (opts.directMkv) {
      if (!(await attachMkv(stale))) return;
    } else if (!isHls || canNativeHls) {
      // Safari/iOS conserve ainsi son lecteur HLS natif.
      video.src = opts.url;
    } else if (!(await attachHlsJs(stale))) {
      return;
    }
    if (stale()) return;
    void video.play().catch((err: unknown) => {
      if (stale() || (err as { name?: string } | null)?.name !== 'NotAllowedError') return;
      opts.onAutoplayBlocked();
    });
  };

  const dispose = () => {
    disposed = true;
    detach();
  };

  return { attach, detach, dispose };
}
