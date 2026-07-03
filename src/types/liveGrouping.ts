import type { BoolNum, LiveChannel } from '@/types/models';

/**
 * Groupement des doublons Live : une entree logique par chaine (TF1), avec ses
 * variantes de qualite (HD/FHD/4K/RAW/HEVC/VIP/backup) accessibles au choix.
 * Aucune variante n'est supprimee — seulement regroupee.
 */

export type ChannelQuality =
  | 'UHD' // 4K / UHD / 2160p
  | 'FHD' // 1080p
  | 'HD' // 720p
  | 'SD'
  | 'HEVC' // H265
  | 'RAW' // flux brut / 60fps
  | 'VIP'
  | 'BACKUP'
  | 'STANDARD'; // aucun tag detecte

export interface ChannelVersion {
  channel: LiveChannel;
  quality: ChannelQuality;
  /** Libelle court pour le selecteur (ex. "4K", "FHD", "HD", "Standard"). */
  label: string;
  /** Score de recommandation (favori/recent/qualite) — plus haut = meilleur. */
  score: number;
}

export interface ChannelGroup {
  /** Cle canonique stable (nom normalise + harmonise). */
  key: string;
  /** Nom d'affichage propre (ex. "TF1", "beIN Sports 1"). */
  name: string;
  isFrench: BoolNum;
  /** Meilleure version (lecture par defaut). */
  best: LiveChannel;
  /** Toutes les variantes, triees meilleure d'abord. */
  versions: ChannelVersion[];
}
