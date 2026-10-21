import * as catalogRepository from '@/db/repositories/catalogRepository';
import type { GroupRow, RankUpdate } from '@/db/repositories/catalogRepository';
import * as settingsRepository from '@/db/repositories/settingsRepository';
import type { AudioLane, MediaVariant, PreferredLanguage } from '@/types/mediaLanguage';
import { variantOrder, variantRank } from '@/utils/variantPreference';

/**
 * REGROUPEMENT DES VERSIONS d'un meme titre (chantier 2).
 *
 * Le fournisseur duplique les entrees ("Film VF", "Film VOSTFR", "Film 4K"…).
 * Chaque ligne porte une `groupKey` (id TMDB sinon titre+annee) ; ce service
 * calcule, PAR GROUPE, deux rangs persistes et indexes :
 *  - `groupRank` : 0 = version representative du titre selon la PREFERENCE de
 *    langue de l'utilisateur (une carte par titre dans « Tout ») ;
 *  - `laneRank`  : 0 = meilleure version de son couloir audio (une carte par
 *    titre dans les pills VF / VOSTFR / VO).
 * Score d'une version : variante preferee >> conteneur lisible nativement (MP4)
 * >> qualite (4K > FHD > HD). Le conteneur passe avant la qualite parce qu'un
 * MP4 se lit partout sans passerelle (cible iPhone) — constante documentee,
 * facile a inverser.
 *
 * Deux modes :
 *  - `regroupSection` : passe COMPLETE (apres sync, ou changement de
 *    preference) — parcours curseur de la table, projection minimale en memoire
 *    (~30 octets/ligne), ecriture par lots des seuls rangs qui changent ;
 *  - `rerankGroups` : INCREMENTAL (apres enrichissement TMDB : une ligne change
 *    de groupe) — deux requetes d'index, jamais de scan.
 * Single-flight par section : les demandes concurrentes sont serialisees.
 */

type VodSection = 'vod' | 'series';

const NATIVE_CONTAINERS = new Set(['mp4', 'm4v', 'mov']);
const BATCH = 1000;

/** Score de version : plus haut = meilleure (variante >> conteneur >> qualite). */
export function versionScore(
  row: { variant: MediaVariant; container: string | null; qualityScore: number },
  order: readonly MediaVariant[],
): number {
  const variantScore = (order.length - variantRank(row.variant, order)) * 10_000;
  const container = (row.container ?? '').trim().toLowerCase();
  const containerScore = NATIVE_CONTAINERS.has(container) ? 1_000 : 0;
  return variantScore + containerScore + Math.min(row.qualityScore, 999);
}

/** Rangs d'un groupe ; ne renvoie que les lignes dont un rang CHANGE. */
export function rankGroup(rows: GroupRow[], order: readonly MediaVariant[]): RankUpdate[] {
  const sorted = [...rows].sort((a, b) => versionScore(b, order) - versionScore(a, order) || a.id.localeCompare(b.id));
  const laneCounters = new Map<AudioLane, number>();
  const updates: RankUpdate[] = [];
  sorted.forEach((row, groupRank) => {
    const laneRank = laneCounters.get(row.lane) ?? 0;
    laneCounters.set(row.lane, laneRank + 1);
    if (row.groupRank !== groupRank || row.laneRank !== laneRank) {
      updates.push({ key: row.id, changes: { groupRank, laneRank } });
    }
  });
  return updates;
}

/** Preference de langue persistee (VF par defaut). */
export async function loadPreferredLanguage(): Promise<PreferredLanguage> {
  return (await settingsRepository.getSetting<PreferredLanguage>('preferredLanguage')) ?? 'VF';
}

const repo = {
  vod: {
    scan: catalogRepository.scanMovieGroupRows,
    byKey: catalogRepository.getMovieGroupRows,
    update: catalogRepository.bulkUpdateMovieRanks,
  },
  series: {
    scan: catalogRepository.scanSeriesGroupRows,
    byKey: catalogRepository.getSeriesGroupRows,
    update: catalogRepository.bulkUpdateSeriesRanks,
  },
} as const;

export interface RegroupResult {
  rows: number;
  groups: number;
  updated: number;
}

/** File single-flight par section (sync + changement de preference peuvent se chevaucher). */
const queues: Record<VodSection, Promise<unknown>> = { vod: Promise.resolve(), series: Promise.resolve() };

function enqueue<T>(section: VodSection, task: () => Promise<T>): Promise<T> {
  const run = queues[section].then(task, task);
  queues[section] = run.catch(() => undefined);
  return run;
}

async function regroupSectionNow(
  section: VodSection,
  order: readonly MediaVariant[],
  onProgress?: (done: number, total: number) => void,
): Promise<RegroupResult> {
  const groups = new Map<string, GroupRow[]>();
  let rows = 0;
  await repo[section].scan((row) => {
    rows += 1;
    const list = groups.get(row.groupKey);
    if (list === undefined) groups.set(row.groupKey, [row]);
    else list.push(row);
  });

  let updates: RankUpdate[] = [];
  let updated = 0;
  let done = 0;
  const flush = async (): Promise<void> => {
    if (updates.length === 0) return;
    await repo[section].update(updates);
    updated += updates.length;
    updates = [];
  };
  for (const list of groups.values()) {
    // Groupe singleton deja a 0/0 : rien a ecrire (cas majoritaire).
    const single = list[0];
    if (list.length === 1 && single !== undefined && single.groupRank === 0 && single.laneRank === 0) {
      done += 1;
      continue;
    }
    updates.push(...rankGroup(list, order));
    done += 1;
    if (updates.length >= BATCH) {
      await flush();
      onProgress?.(done, groups.size);
    }
  }
  await flush();
  onProgress?.(groups.size, groups.size);
  return { rows, groups: groups.size, updated };
}

/**
 * Passe complete d'une section. `pref` omis = preference persistee.
 * Renvoie les comptes (diagnostic / message de reglages).
 */
export function regroupSection(
  section: VodSection,
  pref?: PreferredLanguage,
  onProgress?: (done: number, total: number) => void,
): Promise<RegroupResult> {
  return enqueue(section, async () => {
    const order = variantOrder(pref ?? (await loadPreferredLanguage()));
    return regroupSectionNow(section, order, onProgress);
  });
}

/** Films puis series (changement de preference de langue). */
export async function regroupAll(pref: PreferredLanguage): Promise<Record<VodSection, RegroupResult>> {
  const vod = await regroupSection('vod', pref);
  const series = await regroupSection('series', pref);
  return { vod, series };
}

/**
 * Re-classement INCREMENTAL de quelques groupes (apres enrichissement TMDB :
 * la ligne quitte son groupe titre pour son groupe TMDB). Cles dedoublonnees.
 */
export function rerankGroups(section: VodSection, keys: readonly string[], pref?: PreferredLanguage): Promise<void> {
  const unique = [...new Set(keys)].filter((k) => k !== '');
  if (unique.length === 0) return Promise.resolve();
  return enqueue(section, async () => {
    const order = variantOrder(pref ?? (await loadPreferredLanguage()));
    const updates: RankUpdate[] = [];
    for (const key of unique) {
      const rows = await repo[section].byKey(key);
      if (rows.length > 0) updates.push(...rankGroup(rows, order));
    }
    if (updates.length > 0) await repo[section].update(updates);
  });
}
