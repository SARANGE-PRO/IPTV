import { SECTIONS } from '@/config/constants';
import * as catalogRepository from '@/db/repositories/catalogRepository';
import * as favoritesRepository from '@/db/repositories/favoritesRepository';
import * as playbackRepository from '@/db/repositories/playbackRepository';
import * as tmdbRepository from '@/db/repositories/tmdbRepository';
import type {
  AdvancedDiagnosticReport,
  CategoryAudit,
  DuplicateCluster,
  GroupSuggestion,
  LiveErgonomics,
  SectionSummary,
  TitleQuality,
} from '@/types/advancedDiagnostics';
import type { Section } from '@/types/models';
import type { ChannelTheme } from '@/utils/channelTheme';
import { assertReportSafe, type CredentialHints } from '@/utils/sensitiveDataGuards';
import { redactText } from '@/utils/redaction';
import { auditCategories, suggestGroups } from './categoryQualityAnalyzer';
import { DuplicateAccumulator } from './duplicateDetector';
import { buildRankingSuggestions, TOP10_RECOMMENDATION, type RankingSignals } from './rankingSuggestions';
import {
  accumulateTitle,
  finalizeTitleQuality,
  newTitleAccumulator,
  recommendCleaningRules,
  type TitleQualityAccumulator,
} from './titleQualityAnalyzer';

/**
 * Diagnostic playlist AVANCE : analyse Live/VOD/Séries depuis Dexie par
 * curseur borne (jamais tout le catalogue en memoire), produit un rapport
 * anonymise genere a la demande et jamais persiste. Verification finale
 * anti-fuite avant de rendre le rapport.
 */

const SCAN_CAP = 15000; // borne d'echantillon par section (curseur memoire-legere)
const DUP_LIMIT = 40;
const AUDIT_LIMIT = 120;
const LIVE_THEMES: ChannelTheme[] = ['sport', 'news', 'kids', 'cinema', 'music', 'doc', 'entertainment', 'general'];

function monthLabel(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

async function scanSection(
  section: Section,
): Promise<{ titles: TitleQualityAccumulator; dupes: DuplicateAccumulator; scanned: number; total: number }> {
  const titles = newTitleAccumulator(section);
  const dupes = new DuplicateAccumulator();
  let scanned = 0;
  const total = (await catalogRepository.getCatalogCounts())[section];

  if (section === 'vod') {
    scanned = await catalogRepository.scanMovies(SCAN_CAP, (m) => {
      accumulateTitle(titles, m.name, m.posterUrl);
      dupes.add(m.name);
    });
  } else if (section === 'series') {
    scanned = await catalogRepository.scanSeries(SCAN_CAP, (s) => {
      accumulateTitle(titles, s.name, s.posterUrl);
      dupes.add(s.name);
    });
  }
  return { titles, dupes, scanned, total };
}

async function buildLiveErgonomics(foreignLiveCategories: number): Promise<LiveErgonomics> {
  const byTheme: Record<string, number> = {};
  for (const theme of LIVE_THEMES) {
    byTheme[theme] = await catalogRepository.countLiveChannels({ kind: 'theme', theme });
  }
  const [total, french, uhd] = await Promise.all([
    catalogRepository.countLiveChannels({ kind: 'all' }),
    catalogRepository.countLiveChannels({ kind: 'french' }),
    catalogRepository.countLiveChannels({ kind: 'uhd' }),
  ]);
  return {
    totalChannels: total,
    frenchChannels: french,
    byTheme,
    uhdChannels: uhd,
    suggestedBlacklistCategories: foreignLiveCategories,
  };
}

export async function generateAdvancedDiagnostic(hints?: CredentialHints): Promise<AdvancedDiagnosticReport> {
  const errors: string[] = [];
  const summary: SectionSummary[] = [];
  const categoryAudits: CategoryAudit[] = [];
  const groupSuggestions: GroupSuggestion[] = [];
  const duplicates: DuplicateCluster[] = [];
  const titleQuality: TitleQuality[] = [];
  const titleAccumulators: TitleQualityAccumulator[] = [];
  const confidenceLimits: string[] = [];

  let foreignLiveCategories = 0;
  let hasFrenchMovies = false;
  let hasFrenchSeries = false;

  for (const section of SECTIONS) {
    try {
      const [categories, counts, frenchItems] = await Promise.all([
        catalogRepository.getCategories(section),
        catalogRepository.getCategoryItemCounts(section),
        catalogRepository.countFrenchItems(section),
      ]);

      const audits = auditCategories(section, categories, counts).sort(
        (a, b) => b.issues.length - a.issues.length || b.count - a.count,
      );
      categoryAudits.push(...audits.slice(0, AUDIT_LIMIT));
      groupSuggestions.push(...suggestGroups(section, categories, counts));

      if (section === 'live') {
        foreignLiveCategories = audits.filter((a) => a.issues.includes('foreign') || a.issues.includes('adult')).length;
      }
      if (section === 'vod') hasFrenchMovies = frenchItems > 0;
      if (section === 'series') hasFrenchSeries = frenchItems > 0;

      let totalItems = 0;
      for (const n of counts.values()) totalItems += n;
      summary.push({
        section,
        categories: categories.length,
        frenchCategories: categories.filter((c) => c.isFrench === 1).length,
        items: totalItems,
        frenchItems,
      });

      if (section !== 'live') {
        const { titles, dupes, scanned, total } = await scanSection(section);
        titleAccumulators.push(titles);
        titleQuality.push(finalizeTitleQuality(titles));
        duplicates.push(...dupes.clusters(section, DUP_LIMIT));
        if (scanned < total) {
          confidenceLimits.push(
            `Section ${section} : analyse titres/doublons sur un échantillon de ${scanned} éléments (sur ${total}).`,
          );
        }
      }
    } catch (err) {
      errors.push(`Section ${section} : ${err instanceof Error ? err.message : 'erreur inconnue'}`);
    }
  }

  let liveErgonomics: LiveErgonomics | null = null;
  try {
    liveErgonomics = await buildLiveErgonomics(foreignLiveCategories);
  } catch (err) {
    errors.push(`Ergonomie Live : ${err instanceof Error ? err.message : 'erreur inconnue'}`);
  }

  const [favorites, continueW, recentLive, recentMovies, tmdbFound] = await Promise.all([
    favoritesRepository.getAllFavorites(),
    playbackRepository.getContinueWatching(1),
    playbackRepository.getRecentLiveChannels(1),
    catalogRepository.getRecentMovies(1),
    tmdbRepository.countTmdbFound(),
  ]);

  const signals: RankingSignals = {
    hasFavorites: favorites.length > 0,
    hasPlaybackHistory: continueW.length > 0 || recentLive.length > 0,
    hasFrenchMovies,
    hasFrenchSeries,
    hasRecentDates: recentMovies.length > 0 && recentMovies[0]?.addedAt !== null,
    tmdbConfigured: tmdbFound > 0,
  };

  confidenceLimits.push(
    'Détection FR/pays/thème par mots-clés : approximative, à ajuster selon le fournisseur.',
    'Doublons détectés par titre nettoyé + année : les variantes de qualité/langue peuvent être fusionnées ou manquées.',
  );

  const report: AdvancedDiagnosticReport = {
    generatedAtLabel: monthLabel(),
    schemaVersion: 1,
    anonymized: true,
    summary,
    categoryAudits: categoryAudits.map((a) => ({ ...a, label: redactText(a.label) })),
    groupSuggestions: groupSuggestions.map((g) => ({
      ...g,
      matchedCategories: g.matchedCategories.map(redactText),
    })),
    duplicates: duplicates.map((d) => ({ ...d, key: redactText(d.key), examples: d.examples.map(redactText) })),
    titleQuality,
    recommendedCleaningRules: recommendCleaningRules(titleAccumulators),
    rankingSuggestions: buildRankingSuggestions(signals),
    top10Recommendation: TOP10_RECOMMENDATION,
    liveErgonomics,
    confidenceLimits,
    errors: errors.map(redactText),
  };

  assertReportSafe(JSON.stringify(report), hints);
  return report;
}
