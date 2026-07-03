import type { DiagnosticReport } from '@/types';
import { redactText } from '@/utils/redaction';

/** Applique la redaction a tous les champs textuels du rapport. */
export function anonymizeReport(report: DiagnosticReport): DiagnosticReport {
  return {
    ...report,
    sections: report.sections.map((section) => ({
      ...section,
      categories: section.categories.map((category) => ({
        ...category,
        label: redactText(category.label),
      })),
    })),
    blacklistSuggestions: report.blacklistSuggestions.map((suggestion) => ({
      ...suggestion,
      categoryLabel: redactText(suggestion.categoryLabel),
    })),
    titleSamples: report.titleSamples.map((sample) => ({
      original: redactText(sample.original),
      cleaned: redactText(sample.cleaned),
    })),
    errors: report.errors.map(redactText),
    anonymized: true,
  };
}
