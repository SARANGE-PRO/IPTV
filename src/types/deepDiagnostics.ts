import type { MediaLanguage } from '@/types/mediaLanguage';

/** Rapport de diagnostic complet IPTV — anonymise, jamais de lien de flux. */

export type LanguageCounts = Record<MediaLanguage, number>;

export interface DeepMediaStats {
  total: number;
  withImage: number;
  withoutImage: number;
  french: number;
  withYearInTitle: number;
  languages: LanguageCounts;
}

export interface DeepLiveStats {
  totalFrenchStreams: number;
  logicalChannels: number;
  multiVersionChannels: number;
  withLogo: number;
  withoutLogo: number;
  mainChannelsDetected: number;
  epgAvailable: boolean;
  epgSampleCount: number;
}

export interface DeepDiagnostic {
  generatedAtLabel: string;
  anonymized: true;
  scannedCap: number;
  live: DeepLiveStats;
  movies: DeepMediaStats;
  series: DeepMediaStats;
}
