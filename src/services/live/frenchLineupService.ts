import * as catalogRepository from '@/db/repositories/catalogRepository';
import * as liveLineupRepository from '@/db/repositories/liveLineupRepository';
import * as settingsRepository from '@/db/repositories/settingsRepository';
import * as syncMetadataRepository from '@/db/repositories/syncMetadataRepository';
import { buildLineupEntries, type LineupSourceRow } from '@/services/live/frenchLineupClassifier';
import type { LineupGroup, LiveLineupEntry, LiveLineupMeta } from '@/types/liveLineup';

/**
 * Grille des chaines FR : construite UNE fois (apres une synchro Live, ou quand
 * le referentiel change de version) puis lue telle quelle. Remplace le « pool
 * FR plafonne a 4000 flux lus dans l'ordre des ids » : plus aucune chaine
 * tronquee au hasard, ordre TNT stable, versions adjacentes.
 *
 * Aucune resynchronisation requise : la grille se reconstruit depuis les flux
 * deja en base (nom + nom de categorie).
 */

/** A incrementer a chaque evolution du classement (referentiel, sections…). */
export const LINEUP_VERSION = 1;

const META_KEY = 'liveLineupMeta';

export type EnsureResult = 'fresh' | 'rebuilt';

let inflight: Promise<EnsureResult> | null = null;
let snapshot: { revision: number; groups: Promise<LineupGroup[]> } | null = null;
let revision = 0;

async function currentSourceStamp(): Promise<string> {
  const meta = await syncMetadataRepository.getSyncMetadata('live');
  return `${meta.lastFetchAt ?? 'none'}:${meta.itemCount}`;
}

async function rebuild(sourceStamp: string): Promise<void> {
  const categories = await catalogRepository.getCategories('live');
  const categoryName = new Map(categories.map((c) => [c.id, c.name] as const));
  const rows: LineupSourceRow[] = [];
  await liveLineupRepository.forEachFrenchChannel((c) => {
    rows.push({ id: c.id, name: c.name, categoryId: c.categoryId, logoUrl: c.logoUrl });
  });
  const entries = buildLineupEntries(rows, (id) => categoryName.get(id) ?? '');
  await liveLineupRepository.replaceLineup(entries);
  const meta: LiveLineupMeta = {
    version: LINEUP_VERSION,
    sourceStamp,
    builtAt: Date.now(),
    entries: entries.length,
    groups: new Set(entries.map((e) => e.groupKey)).size,
  };
  await settingsRepository.setSetting(META_KEY, meta);
  revision += 1;
  snapshot = null;
}

/**
 * Garantit une grille a jour : reconstruit si la version du classement ou la
 * synchro Live source ont change. Appel concurrent = meme promesse.
 */
export function ensureFrenchLineup(): Promise<EnsureResult> {
  if (inflight !== null) return inflight;
  const run = (async (): Promise<EnsureResult> => {
    const [meta, stamp] = await Promise.all([
      settingsRepository.getSetting<LiveLineupMeta>(META_KEY),
      currentSourceStamp(),
    ]);
    if (meta?.version === LINEUP_VERSION && meta.sourceStamp === stamp) return 'fresh';
    await rebuild(stamp);
    return 'rebuilt';
  })();
  inflight = run;
  void run.finally(() => {
    if (inflight === run) inflight = null;
  }).catch(() => undefined);
  return run;
}

/** Revision en memoire : change a chaque reconstruction (invalide les vues). */
export function lineupRevision(): number {
  return revision;
}

/** Regroupe des entrees triees par `sortKey` (versions adjacentes). */
export function groupLineup(entries: LiveLineupEntry[]): LineupGroup[] {
  const groups: LineupGroup[] = [];
  let current: LineupGroup | null = null;
  for (const entry of entries) {
    if (current === null || current.key !== entry.groupKey) {
      current = {
        key: entry.groupKey,
        name: entry.name,
        section: entry.section,
        theme: entry.theme,
        lcn: entry.lcn,
        country: entry.country,
        isFootball: entry.isFootball === 1,
        versions: [],
      };
      groups.push(current);
    }
    current.versions.push(entry);
  }
  for (const group of groups) group.versions.sort((a, b) => b.qualityScore - a.qualityScore);
  return groups;
}

/**
 * Chaines logiques de la grille, dans l'ordre. Lecture unique memorisee
 * jusqu'a la prochaine reconstruction (navigation Live instantanee).
 */
export function getLineupGroups(): Promise<LineupGroup[]> {
  if (snapshot === null || snapshot.revision !== revision) {
    const groups = liveLineupRepository.getLineupOrdered().then(groupLineup);
    const entry = { revision, groups };
    snapshot = entry;
    groups.catch(() => {
      if (snapshot === entry) snapshot = null;
    });
  }
  return snapshot.groups;
}

/** Versions (HD/FHD/4K…) de la chaine d'un flux, meilleure d'abord ; [] hors grille. */
export async function getLineupVersions(channelId: string): Promise<LiveLineupEntry[]> {
  const entry = await liveLineupRepository.getLineupEntry(channelId);
  if (entry === undefined) return [];
  const versions = await liveLineupRepository.getLineupGroup(entry.groupKey);
  return versions.sort((a, b) => b.qualityScore - a.qualityScore);
}

/** Entrees de grille de flux donnes (favoris, recents) — undefined hors grille. */
export function getLineupEntries(ids: string[]): Promise<(LiveLineupEntry | undefined)[]> {
  return liveLineupRepository.getLineupEntries(ids);
}
