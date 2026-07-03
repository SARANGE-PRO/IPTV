import * as catalogRepository from '@/db/repositories/catalogRepository';
import * as playbackRepository from '@/db/repositories/playbackRepository';
import { normalizeShortEpg } from '@/services/epg/epgNormalizer';
import { groupChannels } from '@/services/live/channelGroupingService';
import { detectLanguage } from '@/services/media/languageDetectionService';
import * as xtreamApi from '@/services/xtream/xtreamApi';
import type { DeepDiagnostic, DeepMediaStats, LanguageCounts } from '@/types/deepDiagnostics';
import type { MediaExtension } from '@/types/playbackCapabilities';
import { mainFrenchChannelScore } from '@/utils/channelPriority';
import type { XtreamCredentials } from '@/types/xtream';

/**
 * Diagnostic complet IPTV — comprend la distribution des langues, la couverture
 * d'images, les stats de groupement Live FR et la disponibilite EPG. Lecture par
 * CURSEUR borne (jamais tout le catalogue en RAM). Aucun lien de flux exporte.
 */

const CAP = 30_000;
const YEAR = /\b(?:19|20)\d{2}\b/;

function emptyLanguages(): LanguageCounts {
  return { VF: 0, VOSTFR: 0, MULTI: 0, EN: 0, ES: 0, DE: 0, IT: 0, PT: 0, AR: 0, OTHER: 0 };
}

function emptyFormats(): Record<MediaExtension, number> {
  return { mp4: 0, m3u8: 0, mkv: 0, ts: 0, avi: 0, other: 0 };
}

function bucketContainer(ext: string | null): MediaExtension {
  const e = ext?.toLowerCase() ?? '';
  if (e === 'mp4' || e === 'm3u8' || e === 'mkv' || e === 'ts' || e === 'avi') return e;
  return 'other';
}

export async function generateDeepDiagnostic(
  credentials?: XtreamCredentials,
  generatedAtLabel = 'rapport',
): Promise<DeepDiagnostic> {
  const [vodCats, seriesCats] = await Promise.all([
    catalogRepository.getCategories('vod'),
    catalogRepository.getCategories('series'),
  ]);
  const vodCatName = new Map(vodCats.map((c) => [c.id, c.name]));
  const seriesCatName = new Map(seriesCats.map((c) => [c.id, c.name]));

  const movies: DeepMediaStats = {
    total: 0,
    withImage: 0,
    withoutImage: 0,
    french: 0,
    withYearInTitle: 0,
    languages: emptyLanguages(),
  };
  const movieFormats = emptyFormats();
  let moviesWithContainer = 0;
  await catalogRepository.scanMovies(CAP, (m) => {
    movies.total += 1;
    if (m.posterUrl !== null && m.posterUrl !== '') movies.withImage += 1;
    if (m.isFrench === 1) movies.french += 1;
    if (YEAR.test(m.name)) movies.withYearInTitle += 1;
    movies.languages[detectLanguage(m.name, vodCatName.get(m.categoryId) ?? null)] += 1;
    if (m.containerExtension !== null && m.containerExtension !== '') moviesWithContainer += 1;
    movieFormats[bucketContainer(m.containerExtension)] += 1;
  });
  movies.withoutImage = movies.total - movies.withImage;

  const series: DeepMediaStats = {
    total: 0,
    withImage: 0,
    withoutImage: 0,
    french: 0,
    withYearInTitle: 0,
    languages: emptyLanguages(),
  };
  await catalogRepository.scanSeries(CAP, (s) => {
    series.total += 1;
    if (s.posterUrl !== null && s.posterUrl !== '') series.withImage += 1;
    if (s.isFrench === 1) series.french += 1;
    if (s.releaseDate !== null || YEAR.test(s.name)) series.withYearInTitle += 1;
    series.languages[detectLanguage(s.name, seriesCatName.get(s.categoryId) ?? null)] += 1;
  });
  series.withoutImage = series.total - series.withImage;

  // Live FR : groupement + logos + EPG.
  const frPool = await catalogRepository.getLiveChannelsPage({ kind: 'french' }, 0, 4000);
  const groups = groupChannels(frPool);
  const withLogo = frPool.filter((c) => c.logoUrl !== null && c.logoUrl !== '').length;
  const mainChannels = groups.filter((g) => mainFrenchChannelScore(g.best) > 0).length;

  let epgAvailable = false;
  let epgSampleCount = 0;
  if (credentials !== undefined && frPool.length > 0) {
    try {
      const raw = await xtreamApi.getShortEpg(credentials, frPool[0]!.id, 4);
      epgSampleCount = normalizeShortEpg(raw).length;
      epgAvailable = epgSampleCount > 0;
    } catch {
      // EPG indisponible : rapport le signale, pas d'erreur bloquante.
    }
  }

  // Historique local recent (reprises) — jamais de lien de flux.
  const history = await playbackRepository.getRecentHistory(200);

  return {
    generatedAtLabel,
    anonymized: true,
    scannedCap: CAP,
    playback: {
      movieFormats,
      moviesWithContainer,
      historyEntries: history.length,
      historyWithDuration: history.filter((h) => h.durationSec !== null && h.durationSec > 0).length,
      historyFinished: history.filter((h) => h.finished === 1).length,
    },
    live: {
      totalFrenchStreams: frPool.length,
      logicalChannels: groups.length,
      multiVersionChannels: groups.filter((g) => g.versions.length > 1).length,
      withLogo,
      withoutLogo: frPool.length - withLogo,
      mainChannelsDetected: mainChannels,
      epgAvailable,
      epgSampleCount,
    },
    movies,
    series,
  };
}
