import type { ChannelQuality } from '@/types/liveGrouping';
import type { BoolNum } from '@/types/models';
import type { ChannelTheme } from '@/utils/channelTheme';

/**
 * Grille des chaines FR (« lineup ») : une ligne par flux FR, rangee UNE fois
 * (apres la synchro ou a la montee de version du referentiel) puis lue telle
 * quelle par la page Live. Les versions d'une meme chaine (HD/FHD/4K…)
 * partagent `groupKey` ET `sortKey` : elles sont adjacentes dans l'ordre.
 */

/** Sections d'affichage de la vue France, dans l'ordre (voir utils/liveSections). */
export type LiveSection =
  | 'tnt'
  | 'canal'
  | 'sport'
  | 'news'
  | 'cinema'
  | 'series'
  | 'kids'
  | 'doc'
  | 'music'
  | 'regions'
  | 'h247'
  | 'other'
  | 'francophonie';

export interface LiveLineupEntry {
  /** stream_id (cle primaire, identique a LiveChannel.id). */
  id: string;
  /** Chaine logique (TF1) — prefixee du pays hors France (« be:tf1 »). */
  groupKey: string;
  /** Ordre global : section, rang (numero TNT / referentiel), nom naturel. */
  sortKey: string;
  section: LiveSection;
  /** Theme reel (filtres Sport/Info…), distinct de la section d'affichage. */
  theme: ChannelTheme;
  /** Numero TNT (1 TF1, 2 France 2…) sinon null. */
  lcn: number | null;
  /** Nom d'affichage de la chaine logique (referentiel sinon nom fournisseur nettoye). */
  name: string;
  /** Pays hors France (BE, CH, CA, LU, AF…) sinon null. */
  country: string | null;
  isFootball: BoolNum;
  // --- Donnees propres au flux (affichage sans jointure) ---
  rawName: string;
  categoryId: string;
  logoUrl: string | null;
  quality: ChannelQuality;
  qualityLabel: string;
  qualityScore: number;
  isUhd: BoolNum;
}

/** Chaine logique reconstituee a la lecture (versions adjacentes). */
export interface LineupGroup {
  key: string;
  name: string;
  section: LiveSection;
  theme: ChannelTheme;
  lcn: number | null;
  country: string | null;
  isFootball: boolean;
  /** Versions triees meilleure qualite d'abord. */
  versions: LiveLineupEntry[];
}

/** Etat persiste de la grille (settings) : detecte une grille perimee. */
export interface LiveLineupMeta {
  version: number;
  /** Empreinte de la synchro Live source (lastFetchAt + nombre de flux). */
  sourceStamp: string;
  builtAt: number;
  entries: number;
  groups: number;
}
