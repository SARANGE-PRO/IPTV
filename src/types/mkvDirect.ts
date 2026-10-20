/**
 * Lecture DIRECTE d'un MKV dans le navigateur (coquille HTTP, sans passerelle) :
 * le fichier est lu par fetch depuis l'appareil, demuxe (Matroska), remuxe en
 * MP4 fragmente et pousse dans MediaSource / ManagedMediaSource. Aucun decodage
 * en JavaScript : le decodeur materiel de l'appareil fait le travail.
 */

export interface MatroskaTrack {
  number: number;
  type: 'video' | 'audio' | 'subtitle' | 'other';
  codecId: string;
  codecPrivate: Uint8Array | null;
  /** Duree par defaut d'une trame, en ns (facultatif dans le fichier). */
  defaultDurationNs: number | null;
  language: string | null;
  name: string | null;
  isDefault: boolean;
  width: number | null;
  height: number | null;
  channels: number | null;
  sampleRate: number | null;
  /** HE-AAC : frequence de sortie (SBR), sinon null. */
  outputSampleRate: number | null;
}

export interface MatroskaHeader {
  docType: string | null;
  /** ns par unite de temps (defaut 1 000 000 = 1 ms). */
  timecodeScale: number;
  durationSecs: number | null;
  /** Offset ABSOLU du premier octet des donnees du Segment (base des positions SeekHead/Cues). */
  segmentDataStart: number | null;
  segmentSize: number | null;
  tracks: MatroskaTrack[];
  /** Vrai si l'element Tracks a ete lu en entier. */
  tracksFound: boolean;
  /** Offset ABSOLU du premier Cluster, si atteint dans le tampon analyse. */
  firstClusterPos: number | null;
  /** Offset ABSOLU de l'element Cues (via SeekHead), si annonce. */
  cuesPos: number | null;
}

export interface MatroskaBlock {
  trackNumber: number;
  /** Horodatage de presentation en ms (flottant). */
  timeMs: number;
  keyframe: boolean;
  data: Uint8Array;
}

export interface CuePoint {
  timeMs: number;
  /** Offset ABSOLU du Cluster. */
  clusterPos: number;
}

export type MkvDirectErrorCode =
  | 'header'
  | 'no_video'
  | 'unsupported_video'
  | 'unsupported_audio'
  | 'network'
  | 'mse'
  | 'quota';

/** Ce que le remuxeur produit : un segment MP4 pret a etre pousse dans un SourceBuffer. */
export interface RemuxSegment {
  track: 'video' | 'audio';
  data: Uint8Array;
  /** Fenetre de presentation couverte, en ms (pour le diagnostic / la gestion du tampon). */
  startMs: number;
  endMs: number;
}
