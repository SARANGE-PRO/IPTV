import type { ChannelQuality } from '@/types/liveGrouping';

/**
 * Ordre des VERSIONS d'une chaine (HD/FHD/4K…) — brique PURE.
 *
 *  1. Une version qui a echoue la derniere fois (sans succes depuis) passe
 *     en dernier : inutile de refaire l'essai rate.
 *  2. La derniere version qui a VRAIMENT marche passe en premier.
 *  3. Reseau faible : les versions lourdes (4K, FHD, RAW) reculent derriere
 *     la HD — l'image demarre et ne gele pas.
 *  4. Sinon : score qualite (ordre fourni par la grille).
 */

export interface StreamStat {
  ok: number;
  fail: number;
  lastOkAt: number | null;
  lastFailAt: number | null;
}

export interface RankableVersion {
  id: string;
  qualityScore: number;
  quality: ChannelQuality;
}

/** Au-dela, un echec est oublie (le fournisseur a pu reparer la version). */
export const FAILURE_MEMORY_MS = 3 * 86_400_000;
/** Un succes plus ancien ne fait plus « derniere version qui marche ». */
export const SUCCESS_MEMORY_MS = 30 * 86_400_000;

const HEAVY: ReadonlySet<ChannelQuality> = new Set<ChannelQuality>(['UHD', 'FHD', 'RAW']);

export function isHeavyQuality(quality: ChannelQuality): boolean {
  return HEAVY.has(quality);
}

function recentlyFailed(stat: StreamStat | undefined, now: number): boolean {
  if (stat === undefined || stat.lastFailAt === null) return false;
  if (now - stat.lastFailAt > FAILURE_MEMORY_MS) return false;
  return stat.lastOkAt === null || stat.lastFailAt > stat.lastOkAt;
}

export function rankVersions<T extends RankableVersion>(
  versions: readonly T[],
  statOf: (id: string) => StreamStat | undefined,
  opts: { constrained: boolean; now: number },
): T[] {
  if (versions.length < 2) return [...versions];
  // Derniere version qui a marche (et n'a pas echoue depuis).
  let lastGood: string | null = null;
  let lastGoodAt = 0;
  for (const v of versions) {
    const stat = statOf(v.id);
    const at = stat?.lastOkAt ?? null;
    if (at === null || opts.now - at > SUCCESS_MEMORY_MS || recentlyFailed(stat, opts.now)) continue;
    if (at > lastGoodAt) {
      lastGood = v.id;
      lastGoodAt = at;
    }
  }
  const weight = (v: T): number => {
    let w = v.qualityScore;
    if (opts.constrained && isHeavyQuality(v.quality)) w -= 60;
    // Reseau faible : la memoire du « dernier qui marche » ne doit pas
    // ramener la 4K devant la HD.
    if (v.id === lastGood && !(opts.constrained && isHeavyQuality(v.quality))) w += 500;
    if (recentlyFailed(statOf(v.id), opts.now)) w -= 1000;
    return w;
  };
  return versions
    .map((v, i) => ({ v, i, w: weight(v) }))
    .sort((a, b) => b.w - a.w || a.i - b.i)
    .map((x) => x.v);
}
