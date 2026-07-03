import { CACHE_TTL, SECTIONS } from '@/config/constants';
import * as catalogRepository from '@/db/repositories/catalogRepository';
import * as syncMetadataRepository from '@/db/repositories/syncMetadataRepository';
import {
  normalizeCategory,
  normalizeCategoryId,
  normalizeLiveChannel,
  normalizeMovie,
  normalizeSeries,
} from '@/services/xtream/normalize';
import * as xtreamApi from '@/services/xtream/xtreamApi';
import type { Section } from '@/types/models';
import type { XtreamCredentials } from '@/types/xtream';

/**
 * Synchronisation catalogue : fetch metadonnees (via proxy) -> normalisation
 * -> remplacement atomique dans Dexie -> sync_metadata (TTL, statut, comptes).
 */

const SECTION_TTL: Record<Section, number> = {
  live: CACHE_TTL.liveStreams,
  vod: CACHE_TTL.vod,
  series: CACHE_TTL.series,
};

export interface SectionOutcome {
  section: Section;
  ok: boolean;
  skipped: boolean;
  categoryCount: number;
  itemCount: number;
  error: string | null;
}

function fetchCategories(creds: XtreamCredentials, section: Section) {
  if (section === 'live') return xtreamApi.getLiveCategories(creds);
  if (section === 'vod') return xtreamApi.getVodCategories(creds);
  return xtreamApi.getSeriesCategories(creds);
}

async function fetchAndStoreItems(
  creds: XtreamCredentials,
  section: Section,
  frenchByCategory: Map<string, boolean>,
): Promise<number> {
  if (section === 'live') {
    const raw = await xtreamApi.getLiveStreams(creds);
    const items = (Array.isArray(raw) ? raw : []).map((r) =>
      normalizeLiveChannel(r, frenchByCategory.get(normalizeCategoryId(r.category_id)) === true),
    );
    await catalogRepository.replaceLiveChannels(items);
    return items.length;
  }
  if (section === 'vod') {
    const raw = await xtreamApi.getVodStreams(creds);
    const items = (Array.isArray(raw) ? raw : []).map((r) =>
      normalizeMovie(r, frenchByCategory.get(normalizeCategoryId(r.category_id)) === true),
    );
    await catalogRepository.replaceMovies(items);
    return items.length;
  }
  const raw = await xtreamApi.getSeries(creds);
  const items = (Array.isArray(raw) ? raw : []).map((r) =>
    normalizeSeries(r, frenchByCategory.get(normalizeCategoryId(r.category_id)) === true),
  );
  await catalogRepository.replaceSeries(items);
  return items.length;
}

/** Synchronise une section complete (categories + liste d'items). */
export async function syncSection(
  creds: XtreamCredentials,
  section: Section,
): Promise<{ categoryCount: number; itemCount: number }> {
  await syncMetadataRepository.markSyncStart(section);
  try {
    const rawCategories = await fetchCategories(creds, section);
    const categories = (Array.isArray(rawCategories) ? rawCategories : []).map((c) =>
      normalizeCategory(section, c),
    );
    await catalogRepository.replaceCategories(section, categories);

    const frenchByCategory = new Map<string, boolean>(
      categories.map((c) => [c.id, c.isFrench === 1] as [string, boolean]),
    );
    const itemCount = await fetchAndStoreItems(creds, section, frenchByCategory);

    await syncMetadataRepository.markSyncSuccess(section, {
      categoryCount: categories.length,
      itemCount,
    });
    return { categoryCount: categories.length, itemCount };
  } catch (err) {
    await syncMetadataRepository.markSyncError(
      section,
      err instanceof Error ? err.message : 'Erreur inconnue',
    );
    throw err;
  }
}

/**
 * Synchronise les 3 sections sequentiellement (memoire maitrisee).
 * Sans `force`, une section encore fraiche (TTL sync_metadata) est sautee.
 * Une section en erreur n'empeche pas les suivantes.
 */
export async function syncAllSections(
  creds: XtreamCredentials,
  opts?: {
    force?: boolean;
    onSectionStart?: (section: Section) => void;
    onSectionDone?: (outcome: SectionOutcome) => void;
  },
): Promise<SectionOutcome[]> {
  const outcomes: SectionOutcome[] = [];
  for (const section of SECTIONS) {
    opts?.onSectionStart?.(section);
    let outcome: SectionOutcome;
    try {
      const fresh = !(opts?.force ?? false) && !(await syncMetadataRepository.isStale(section, SECTION_TTL[section]));
      if (fresh) {
        const meta = await syncMetadataRepository.getSyncMetadata(section);
        outcome = {
          section,
          ok: true,
          skipped: true,
          categoryCount: meta.categoryCount,
          itemCount: meta.itemCount,
          error: null,
        };
      } else {
        const result = await syncSection(creds, section);
        outcome = { section, ok: true, skipped: false, ...result, error: null };
      }
    } catch (err) {
      outcome = {
        section,
        ok: false,
        skipped: false,
        categoryCount: 0,
        itemCount: 0,
        error: err instanceof Error ? err.message : 'Erreur inconnue',
      };
    }
    outcomes.push(outcome);
    opts?.onSectionDone?.(outcome);
  }
  return outcomes;
}
