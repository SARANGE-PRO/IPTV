import type { PlaybackFailure } from '@/types/playbackDiagnostics';

/**
 * Lecture en cours (lecteur unique de l'app, voir components/player/host).
 * Types partages store <-> composants : aucune dependance UI.
 */

export type NowPlayingKind = 'live' | 'vod' | 'episode';

/** Ce qui est lu, pour l'affichage (mini-lecteur, ecran verrouille). */
export interface NowPlayingMedia {
  kind: NowPlayingKind;
  /** Ce que l'utilisateur a ouvert : chaine, fiche film, fiche serie. */
  ownerId: string;
  /** Ce qui est reellement lu : chaine, variante de langue, episode. */
  itemId: string;
  title: string;
  subtitle: string | null;
  artwork: string | null;
}

/** Parametres de lecture transmis tels quels au lecteur video. */
export interface PlayerSource {
  src: string;
  poster?: string | null;
  live?: boolean;
  startAt?: number;
  startOffset?: number;
  duration?: number | null;
  transcode?: boolean;
  preferHls?: boolean;
  directMkv?: boolean;
  contentType?: 'live' | 'vod' | 'episode';
  container?: string | null;
}

/** Action proposee sur l'ecran d'echec definitif (« Chaine suivante », VLC…). */
export interface PlayerErrorAction {
  label: string;
  onSelect: () => void;
}

/** Rappels de la page qui a lance la lecture. Survivent a sa fermeture (la
 *  progression continue d'etre enregistree en mini-lecteur). */
export interface PlayerHandlers {
  onProgress?: (positionSec: number, durationSec: number | null, force: boolean) => void;
  onEnded?: () => void;
  /** Echec definitif (apres les relances automatiques du lecteur). */
  onError?: (failure: PlaybackFailure) => void;
  onDirectMkvFailed?: () => void;
  /** Alternatives affichees sous le message d'echec definitif. */
  errorActions?: PlayerErrorAction[];
}

export interface PlayerSession {
  /** Identite de LECTURE : meme cle = meme flux, rien n'est recharge. */
  key: string;
  media: NowPlayingMedia;
  source: PlayerSource;
}
