/** Types partages transverses. */

export type MediaType = 'live' | 'vod' | 'series';

/** Etat de chargement generique pour les vues (loading / empty / error). */
export type LoadState = 'idle' | 'loading' | 'ready' | 'error' | 'empty';

export type {
  Section,
  SectionStats,
  CategoryStat,
  BlacklistSuggestion,
  TitleCleaningSample,
  DiagnosticReport,
} from './diagnostics';
