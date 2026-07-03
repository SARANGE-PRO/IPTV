import type { DuplicateCluster } from '@/types/advancedDiagnostics';
import type { Section } from '@/types/models';
import { normalizeText } from '@/utils/text';
import { cleanTitle } from '@/utils/titleCleaner';

/**
 * Detecteur de doublons par CLE normalisee (titre nettoye + annee), agrege au
 * fil du curseur — on ne conserve que le compteur et quelques exemples par cle,
 * jamais tout le catalogue.
 */

interface Bucket {
  count: number;
  examples: string[];
}

export class DuplicateAccumulator {
  private readonly buckets = new Map<string, Bucket>();

  add(name: string): void {
    const { title, year } = cleanTitle(name);
    const norm = normalizeText(title);
    if (norm.length < 2) return;
    const key = year !== null ? `${norm} (${year})` : norm;
    const bucket = this.buckets.get(key);
    if (bucket === undefined) {
      this.buckets.set(key, { count: 1, examples: [name] });
    } else {
      bucket.count += 1;
      if (bucket.examples.length < 3) bucket.examples.push(name);
    }
  }

  /** Grappes de doublons (count > 1), les plus nombreuses d'abord, limitees. */
  clusters(section: Section, limit: number): DuplicateCluster[] {
    const out: DuplicateCluster[] = [];
    for (const [key, bucket] of this.buckets) {
      if (bucket.count > 1) out.push({ section, key, count: bucket.count, examples: bucket.examples });
    }
    return out.sort((a, b) => b.count - a.count).slice(0, limit);
  }

  /** Nombre total de doublons estime (items en trop). */
  totalDuplicates(): number {
    let extra = 0;
    for (const bucket of this.buckets.values()) if (bucket.count > 1) extra += bucket.count - 1;
    return extra;
  }
}
