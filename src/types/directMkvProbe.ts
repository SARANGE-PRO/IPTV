/**
 * Sonde « lecture directe d'un MKV » (etape 2 de la coquille HTTP) : peut-on
 * lire un MKV DANS Safari sans passerelle, en le remuxant cote client vers
 * MediaSource ? Trois conditions : fetch direct autorise (CORS + Range),
 * conteneur Matroska lisible, codecs decodables par l'appareil.
 *
 * Rapport ANONYME (invariant #4) : jamais d'URL, d'hote ni d'identifiant —
 * uniquement des metadonnees structurelles (codecs, resolution, langues).
 */

export interface MatroskaVideoTrack {
  codecId: string;
  width: number | null;
  height: number | null;
  /** Profil/niveau/bit depth extraits de CodecPrivate (hvcC/avcC) si presents. */
  profile: number | null;
  level: number | null;
  bitDepth: number | null;
}

export interface MatroskaAudioTrack {
  codecId: string;
  channels: number | null;
  sampleRate: number | null;
  language: string | null;
  name: string | null;
  isDefault: boolean;
}

export interface MatroskaSubtitleTrack {
  codecId: string;
  language: string | null;
  name: string | null;
}

export interface MatroskaSummary {
  docType: string | null;
  /** Taille du Segment (≈ taille du fichier) si connue. */
  segmentSize: number | null;
  durationSecs: number | null;
  tracksFound: boolean;
  video: MatroskaVideoTrack[];
  audio: MatroskaAudioTrack[];
  subtitles: MatroskaSubtitleTrack[];
}

/** Ce que MediaSource / ManagedMediaSource de l'appareil accepte. */
export interface MseCapabilities {
  managedMediaSource: boolean;
  mediaSource: boolean;
  hevcMain: boolean;
  hevcMain10: boolean;
  avc: boolean;
  aac: boolean;
  ac3: boolean;
  eac3: boolean;
  opus: boolean;
  flac: boolean;
  mp3: boolean;
}

export type DirectFetchOutcome =
  /** GET + Range accepte, 206 recu. */
  | 'range-ok'
  /** GET accepte mais le serveur ignore Range (200 complet). */
  | 'range-ignored'
  /** GET simple OK mais la requete avec Range est refusee (preflight CORS). */
  | 'range-preflight-blocked'
  /** Aucune requete fetch n'aboutit : CORS absent (ou reseau). */
  | 'cors-blocked'
  /** Page HTTPS : un flux HTTP est bloque avant meme CORS. */
  | 'mixed-content'
  | 'http-error'
  | 'timeout';

export type DirectMkvVerdict =
  | 'possible'
  | 'possible-sans-seek'
  | 'cors-blocked'
  | 'mixed-content'
  | 'not-matroska'
  | 'video-unsupported'
  | 'audio-unsupported'
  | 'mse-unavailable'
  | 'inconnu';

export interface DirectMkvProbeResult {
  generatedAt: string;
  fetch: DirectFetchOutcome;
  httpStatus: number | null;
  contentType: string | null;
  bytesRead: number;
  matroska: MatroskaSummary | null;
  mse: MseCapabilities;
  /** Codecs video/audio juges lisibles (apres croisement MKV x MSE). */
  playableVideo: string[];
  playableAudio: string[];
  verdict: DirectMkvVerdict;
  /** Explication courte, lisible, sans donnee sensible. */
  reason: string;
}
