import { SECTIONS } from '@/config/constants';
import * as catalogRepository from '@/db/repositories/catalogRepository';
import type { CategoryStat, DiagnosticReport, SectionStats, TitleCleaningSample } from '@/types';
import type { Section } from '@/types/models';
import { assertReportSafe, type CredentialHints } from '@/utils/sensitiveDataGuards';
import { cleanTitle } from '@/utils/titleCleaner';
import { anonymizeReport } from './anonymizeReport';
import { suggestBlacklist } from './blacklistSuggestions';

/**
 * Diagnostic ANONYMISE du catalogue : lit les donnees synchronisees dans
 * Dexie, produit un rapport genere A LA DEMANDE, jamais persiste. La
 * redaction (anonymizeReport) puis la verification finale (assertReportSafe)
 * garantissent l'absence de donnees sensibles avant de rendre le rapport.
 */

const SAMPLES_PER_TYPE = 8;

function monthLabel(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

async function buildSectionStats(section: Section): Promise<SectionStats> {
  const [categories, counts, frenchItems] = await Promise.all([
    catalogRepository.getCategories(section),
    catalogRepository.getCategoryItemCounts(section),
    catalogRepository.countFrenchItems(section),
  ]);

  const categoryStats: CategoryStat[] = categories.map((c) => ({
    label: c.name,
    count: counts.get(c.id) ?? 0,
    isFrench: c.isFrench === 1,
    detectedCountry: c.country,
  }));

  let totalItems = 0;
  for (const n of counts.values()) totalItems += n;

  return {
    section,
    totalCategories: categories.length,
    totalItems,
    frenchCategories: categoryStats.filter((c) => c.isFrench).length,
    frenchItems,
    categories: categoryStats,
  };
}

export async function generateDiagnosticReport(hints?: CredentialHints): Promise<DiagnosticReport> {
  const errors: string[] = [];
  const sections: SectionStats[] = [];

  for (const section of SECTIONS) {
    try {
      sections.push(await buildSectionStats(section));
    } catch (err) {
      errors.push(`Section ${section} : ${err instanceof Error ? err.message : 'erreur inconnue'}`);
    }
  }

  if (sections.every((s) => s.totalCategories === 0 && s.totalItems === 0)) {
    errors.push('Catalogue vide — lance la synchronisation avant le diagnostic.');
  }

  const [movies, series] = await Promise.all([
    catalogRepository.getMoviesSample(SAMPLES_PER_TYPE),
    catalogRepository.getSeriesSample(SAMPLES_PER_TYPE),
  ]);
  const titleSamples: TitleCleaningSample[] = [
    ...movies.map((m) => m.name),
    ...series.map((s) => s.name),
  ].map((original) => {
    const cleaned = cleanTitle(original);
    return {
      original,
      cleaned: cleaned.year !== null ? `${cleaned.title} (${cleaned.year})` : cleaned.title,
    };
  });

  const report: DiagnosticReport = {
    generatedAtLabel: monthLabel(),
    schemaVersion: 1,
    sections,
    blacklistSuggestions: suggestBlacklist(sections),
    titleSamples,
    errors,
    anonymized: true,
  };

  const safe = anonymizeReport(report);
  assertReportSafe(JSON.stringify(safe), hints);
  return safe;
}
