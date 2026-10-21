/**
 * Variante de langue d'un film / d'une serie (fondation langue, chantier 1).
 *
 * Deduite A LA NORMALISATION depuis le titre Xtream (tags) puis la categorie
 * fournisseur (prefixe / mots-cles), PERSISTEE et INDEXEE dans Dexie — jamais
 * recalculee a l'affichage. Voir utils/mediaTitle.ts.
 *
 *  - VF     : piste audio francaise (VF, VFF, VFQ, VFI, VF2, TRUEFRENCH, FRENCH,
 *             categorie FR/France/Quebec/Belgique/Suisse).
 *  - MULTI  : plusieurs pistes audio (francais inclus en pratique).
 *  - VOSTFR : audio original sous-titre francais (VOSTFR, VOSTF, SUBFRENCH, VOST).
 *  - VO     : version originale sans francais (VO, EN/US/UK) OU langue inconnue.
 *  - OTHER  : langue etrangere identifiee (arabe, turc, espagnol, allemand…).
 */
export type MediaVariant = 'VF' | 'MULTI' | 'VOSTFR' | 'VO' | 'OTHER';

export const MEDIA_VARIANTS: readonly MediaVariant[] = ['VF', 'MULTI', 'VOSTFR', 'VO', 'OTHER'];

/**
 * « Couloir » audio : regroupe les variantes par usage. Sert aux pills du
 * navigateur (VF = audio francais, VOSTFR, VO) et au rang par couloir
 * (`laneRank`) qui dedoublonne « une carte par titre ET par couloir ».
 */
export type AudioLane = 'fr' | 'vost' | 'vo' | 'other';

export function laneOf(variant: MediaVariant): AudioLane {
  if (variant === 'VF' || variant === 'MULTI') return 'fr';
  if (variant === 'VOSTFR') return 'vost';
  if (variant === 'VO') return 'vo';
  return 'other';
}

/** Vrai si un francophone peut regarder sans effort (audio FR ou sous-titres FR). */
export function isFrenchWatchable(variant: MediaVariant): boolean {
  return variant === 'VF' || variant === 'MULTI' || variant === 'VOSTFR';
}

/**
 * Provenance de la variante : 0 = aucune information (VO par defaut),
 * 1 = deduite de la categorie fournisseur, 2 = tag explicite dans le titre.
 * Non indexee ; pilote l'affichage de la pastille (pas de « VO » affiche quand
 * on ne sait pas).
 */
export type VariantSource = 0 | 1 | 2;

/** Langue/variante audio detectee d'un contenu — DIAGNOSTIC uniquement. */
export type MediaLanguage =
  | 'VF'
  | 'VOSTFR'
  | 'MULTI'
  | 'EN'
  | 'ES'
  | 'DE'
  | 'IT'
  | 'PT'
  | 'AR'
  | 'OTHER';

/** Variante francophone mise en avant sur les cartes (null = pas de tag fiable). */
export type FrenchVariant = 'VF' | 'MULTI' | 'VOSTFR';

/**
 * Langue/variante audio PREFEREE de l'utilisateur (reglage persiste). Pilote
 * l'ordre des variantes (utils/variantPreference.ts), le choix de la version
 * representative d'un titre (groupRank) et la piste audio du remux MKV.
 */
export type PreferredLanguage = 'VF' | 'VOSTFR' | 'MULTI' | 'EN' | 'ES' | 'DE' | 'IT' | 'PT';
