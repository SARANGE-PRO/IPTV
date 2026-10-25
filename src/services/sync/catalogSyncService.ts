import { CACHE_TTL, SECTIONS } from '@/config/constants';
import * as catalogRepository from '@/db/repositories/catalogRepository';
import * as syncMetadataRepository from '@/db/repositories/syncMetadataRepository';
import {
  normalizeCategory,
  normalizeCategoryId,
  normalizeLiveChannel,
  normalizeMovie,
  normalizeSeries,
  type CategoryContext,
} from '@/services/xtream/normalize';
import { regroupSection } from '@/services/catalog/catalogGroupingService';
import { invalidateLivePool } from '@/services/live/liveZappingService';
import { ensureAllGenres } from '@/services/tmdb/tmdbGenreService';
import * as xtreamApi from '@/services/xtream/xtreamApi';
import type { Category, Section } from '@/types/models';
import type {
  NumLike,
  XtreamCategory,
  XtreamCredentials,
  XtreamLiveStream,
  XtreamSeries,
  XtreamVodStream,
} from '@/types/xtream';

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

/**
 * Garde-fou : une reponse qui n'est pas une liste (panel en maintenance, page
 * d'erreur, `{"user_info":...}` d'un compte expire) ne doit JAMAIS remplacer
 * la section par 0 element. On leve : l'ancien catalogue reste, statut erreur.
 */
export function requireList<T>(raw: unknown, what: string): T[] {
  if (!Array.isArray(raw)) throw new Error(`Reponse inattendue du serveur (${what})`);
  return raw as T[];
}

/** Liste vide alors que la section a des categories : reponse tronquee, refusee. */
export function requireItems<T>(items: T[], categoryCount: number, what: string): T[] {
  if (items.length === 0 && categoryCount > 0) throw new Error(`Liste vide renvoyee par le serveur (${what})`);
  return items;
}

/**
 * Generation de synchro : la deconnexion (ou un changement de compte) l'avance
 * -> une synchro en cours n'ecrit plus rien apres la purge (sinon l'ancien
 * catalogue reapparaissait sous le nouveau compte).
 */
let syncGeneration = 0;

class SyncCancelled extends Error {
  constructor() {
    super('Synchro annulee');
    this.name = 'SyncCancelled';
  }
}

/** Abandonne toute synchro en cours (avant une purge du catalogue). */
export function cancelCatalogSync(): void {
  syncGeneration += 1;
}

function fetchCategories(creds: XtreamCredentials, section: Section) {
  if (section === 'live') return xtreamApi.getLiveCategories(creds);
  if (section === 'vod') return xtreamApi.getVodCategories(creds);
  return xtreamApi.getSeriesCategories(creds);
}

/**
 * Recupere le JSON brut d'une section et l'ecrit ATOMIQUEMENT avec ses categories
 * (une seule transaction) : plus de fenetre "nouvelles categories + anciens items"
 * si l'onglet ferme en cours. Normalisation PAR LOTS (memoire bornee, anti-OOM).
 */
async function storeSection(
  creds: XtreamCredentials,
  section: Section,
  categories: Category[],
  categoryById: Map<string, Category>,
  ensureAlive: () => void,
): Promise<number> {
  // Contexte de categorie (nom + flag FR) : repli de langue des films/series
  // sans tag dans le titre, theme des chaines Live.
  const context = (categoryId: NumLike | null | undefined): CategoryContext | undefined => {
    const cat = categoryById.get(normalizeCategoryId(categoryId));
    return cat !== undefined ? { isFrench: cat.isFrench === 1, name: cat.name } : undefined;
  };

  if (section === 'live') {
    const raw = requireItems(requireList<XtreamLiveStream>(await xtreamApi.getLiveStreams(creds), 'chaines'), categories.length, 'chaines');
    ensureAlive();
    const count = await catalogRepository.replaceLiveCatalog(categories, raw, (r) =>
      normalizeLiveChannel(r, context(r.category_id)),
    );
    invalidateLivePool();
    return count;
  }
  if (section === 'vod') {
    const raw = requireItems(requireList<XtreamVodStream>(await xtreamApi.getVodStreams(creds), 'films'), categories.length, 'films');
    ensureAlive();
    const count = await catalogRepository.replaceVodCatalog(categories, raw, (r) =>
      normalizeMovie(r, context(r.category_id)),
    );
    // Une carte par titre : rangs de version calcules sur la table fraichement ecrite.
    await regroupSection('vod');
    return count;
  }
  const raw = requireItems(requireList<XtreamSeries>(await xtreamApi.getSeries(creds), 'series'), categories.length, 'series');
  ensureAlive();
  const count = await catalogRepository.replaceSeriesCatalog(categories, raw, (r) =>
    normalizeSeries(r, context(r.category_id)),
  );
  await regroupSection('series');
  return count;
}

/** Synchronise une section complete (categories + liste d'items). */
export async function syncSection(
  creds: XtreamCredentials,
  section: Section,
  generation: number = syncGeneration,
): Promise<{ categoryCount: number; itemCount: number }> {
  const ensureAlive = () => {
    if (generation !== syncGeneration) throw new SyncCancelled();
  };
  await syncMetadataRepository.markSyncStart(section);
  try {
    const rawCategories = await fetchCategories(creds, section);
    const categories = requireList<XtreamCategory>(rawCategories, 'categories').map((c) =>
      normalizeCategory(section, c),
    );
    const categoryById = new Map<string, Category>(categories.map((c) => [c.id, c] as [string, Category]));
    const itemCount = await storeSection(creds, section, categories, categoryById, ensureAlive);
    ensureAlive();

    await syncMetadataRepository.markSyncSuccess(section, {
      categoryCount: categories.length,
      itemCount,
    });
    return { categoryCount: categories.length, itemCount };
  } catch (err) {
    // Annulee (deconnexion) : les metadonnees viennent d'etre purgees, on n'ecrit rien.
    if (err instanceof SyncCancelled) throw err;
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
  const generation = syncGeneration;
  for (const section of SECTIONS) {
    if (generation !== syncGeneration) break;
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
        const result = await syncSection(creds, section, generation);
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
  // Genres TMDB prechauffes en tache de fond (pills). Le BACKFILL d'enrichissement
  // est lance par catalogStore (au demarrage ET apres sync, chantier 3), qui en
  // suit la progression — plus de demarrage « orphelin » ici.
  if (outcomes.some((o) => (o.section === 'vod' || o.section === 'series') && o.ok && !o.skipped)) {
    void ensureAllGenres().catch(() => {});
  }
  return outcomes;
}
