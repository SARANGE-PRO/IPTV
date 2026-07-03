/**
 * Types du MODE DIAGNOSTIC ANONYMISE.
 *
 * Objectif : analyser le catalogue Xtream (categories FR, stats, suggestions
 * de blacklist, exemples de nettoyage de titres) et produire un rapport JSON
 * EXPORTABLE, genere a la demande et JAMAIS persiste.
 *
 * Garantie de confidentialite — un rapport ne doit JAMAIS contenir :
 *   - username, password
 *   - URL complete du serveur Xtream
 *   - liens de flux (.m3u8, .ts, .mp4), identifiants de stream, tokens
 * La couche `utils/redaction.ts` + `utils/sensitiveDataGuards.ts` (etape 3)
 * applique et verifie ces regles avant export.
 */

export type Section = 'live' | 'vod' | 'series';

export interface CategoryStat {
  /** Libelle de categorie, deja nettoye (aucune donnee sensible). */
  label: string;
  count: number;
  isFrench: boolean;
  /** Code pays detecte (ISO-2) ou null si indetermine. */
  detectedCountry: string | null;
}

export interface SectionStats {
  section: Section;
  totalCategories: number;
  totalItems: number;
  frenchCategories: number;
  frenchItems: number;
  categories: CategoryStat[];
}

export type BlacklistReason =
  | 'non-french'
  | 'adult'
  | 'duplicate'
  | 'low-quality'
  | 'foreign-language';

export interface BlacklistSuggestion {
  categoryLabel: string;
  section: Section;
  reason: BlacklistReason;
  /** Confiance 0..1 — l'utilisateur decide, rien n'est masque d'office. */
  confidence: number;
}

export interface TitleCleaningSample {
  /** Titre d'origine deja anonymise (aucun lien, aucun token). */
  original: string;
  /** Titre nettoye, pret pour le matching TMDB. */
  cleaned: string;
}

export interface DiagnosticReport {
  /** Ex. "2026-07" — jamais un timestamp precis potentiellement identifiant. */
  generatedAtLabel: string;
  schemaVersion: number;
  sections: SectionStats[];
  blacklistSuggestions: BlacklistSuggestion[];
  titleSamples: TitleCleaningSample[];
  /** Drapeau garantissant l'anonymisation (verifie avant export). */
  anonymized: true;
}
