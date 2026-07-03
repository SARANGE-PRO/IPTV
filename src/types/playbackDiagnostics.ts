/**
 * Diagnostic de lecture : capture PRECISE de la cause d'un echec de lecture
 * (Live/VOD/serie), copiable par l'utilisateur pour transmission. Anonymise :
 * ne contient JAMAIS l'URL de flux, ni identifiants, ni token (invariant #4).
 */

export type PlaybackErrorCode =
  | 'invalid_url'
  | 'unsupported_container'
  | 'load_timeout'
  | 'hls_network'
  | 'hls_media'
  | 'hls_fatal'
  | 'hls_unsupported'
  | 'hls_module_failed'
  | 'native_error'
  | 'unknown';

/** Detail structure d'un echec, rempli au plus pres de la source. */
export interface PlaybackFailure {
  code: PlaybackErrorCode;
  /** Message affiche a l'utilisateur (deja localise). */
  message: string;
  /** Statut HTTP amont si connu (HLS.js) : 456 IP bloquee, 458 limite connexions, 403, 404... */
  httpStatus?: number | null;
  /** MediaError.code du <video> natif (1 aborted, 2 network, 3 decode, 4 src non supporte). */
  mediaErrorCode?: number | null;
  /** Detail technique brut (ex. hls.js details) — jamais d'URL. */
  detail?: string | null;
}

/** Contexte de ce qui etait lu au moment de l'echec. */
export interface PlaybackContext {
  type: 'live' | 'vod' | 'episode';
  /** Extension de conteneur (mkv, mp4, m3u8, ts...) — pas l'URL. */
  container: string | null;
  /** La lecture passait-elle par la passerelle (transcodage) ? */
  transcode: boolean;
}

export interface PlaybackDiagnostic {
  generatedAt: number;
  content: {
    type: PlaybackContext['type'];
    container: string | null;
    via: 'gateway' | 'direct' | 'hls-natif' | 'inconnu';
  };
  failure: PlaybackFailure;
  env: {
    userAgent: string;
    standalone: boolean;
    online: boolean;
    connection: string | null;
    nativeHls: boolean;
  };
  gateway: {
    configured: boolean;
    healthy: boolean | null;
  };
}
