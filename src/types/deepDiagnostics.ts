import type { MediaLanguage } from '@/types/mediaLanguage';
import type { MediaExtension } from '@/types/playbackCapabilities';

/** Rapport de diagnostic complet IPTV — anonymise, jamais de lien de flux. */

export type LanguageCounts = Record<MediaLanguage, number>;

export interface PlaybackStats {
  /** Distribution des conteneurs de films (mp4/mkv/ts…). */
  movieFormats: Record<MediaExtension, number>;
  moviesWithContainer: number;
  /** Historique local recent (reprises). */
  historyEntries: number;
  historyWithDuration: number;
  historyFinished: number;
}

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
  /** Separateurs de menu + flux evenementiels/PPV exclus du bouquet principal. */
  separatorsOrEvents: number;
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
  playback: PlaybackStats;
}
