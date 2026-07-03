import type { Section } from './models';

/** Rapport de diagnostic playlist AVANCE — genere a la demande, anonymise, jamais persiste. */

export type CategoryIssue =
  | 'empty'
  | 'tiny'
  | 'too-broad'
  | 'adult'
  | 'duplicate'
  | 'mislabeled'
  | 'foreign';

export interface CategoryAudit {
  label: string;
  section: Section;
  count: number;
  isFrench: boolean;
  detectedCountry: string | null;
  issues: CategoryIssue[];
}

export interface GroupSuggestion {
  name: string;
  section: Section;
  matchedCategories: string[];
  approxItems: number;
}

export interface DuplicateCluster {
  section: Section;
  key: string;
  count: number;
  examples: string[];
}

export interface TitleQuality {
  section: Section;
  sampled: number;
  withQualityTags: number;
  withLanguageTags: number;
  withYearInTitle: number;
  noisy: number;
  likelyUnmatchable: number;
  missingImage: number;
}

export interface RankingSuggestion {
  rail: string;
  rationale: string;
  dataAvailable: boolean;
}

export interface LiveErgonomics {
  totalChannels: number;
  frenchChannels: number;
  byTheme: Record<string, number>;
  uhdChannels: number;
  suggestedBlacklistCategories: number;
}

export interface SectionSummary {
  section: Section;
  categories: number;
  frenchCategories: number;
  items: number;
  frenchItems: number;
}

export interface AdvancedDiagnosticReport {
  generatedAtLabel: string;
  schemaVersion: number;
  anonymized: true;
  summary: SectionSummary[];
  categoryAudits: CategoryAudit[];
  groupSuggestions: GroupSuggestion[];
  duplicates: DuplicateCluster[];
  titleQuality: TitleQuality[];
  recommendedCleaningRules: string[];
  rankingSuggestions: RankingSuggestion[];
  top10Recommendation: string;
  liveErgonomics: LiveErgonomics | null;
  confidenceLimits: string[];
  errors: string[];
}
