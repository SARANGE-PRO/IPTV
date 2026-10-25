import type { PlaybackErrorCode } from '@/types/playbackDiagnostics';
import { classifyContainer } from '@/utils/playerSupport';

/** Extension en MAJ si le conteneur du flux est illisible en navigateur, sinon null. */
export function unsupportedContainer(rawSrc: string): string | null {
  const path = rawSrc.split(/[?#]/)[0] ?? '';
  const ext = path.match(/\.([a-z0-9]{2,5})$/i)?.[1];
  return ext !== undefined && classifyContainer(ext) === 'transcode' ? ext.toUpperCase() : null;
}

/** Echecs qu'un nouvel essai ne changera pas : pas de bouton « Reessayer ». */
export const NOT_RETRYABLE: ReadonlySet<PlaybackErrorCode> = new Set<PlaybackErrorCode>([
  'invalid_url',
  'unsupported_container',
  'hls_unsupported',
  'mkv_direct_unsupported',
]);

/** Messages d'echec DEFINITIF (apres les relances automatiques). */
export const PLAYBACK_MESSAGES = {
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
