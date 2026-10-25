import { buildOverview, type LiveViewId } from '@/services/live/liveViews';
import type { LineupGroup, LiveSection } from '@/types/liveLineup';
import type { TvNow } from '@/types/tvGuide';

/**
 * Vitrine de la page Live (vue France) — logique PURE : le programme mis en
 * avant « En ce moment » et les rangees par theme. La page n'ajoute que le
 * rendu ; rien n'est recalcule hors de la grille FR deja rangee.
 */

/** Grandes chaines eligibles a la carte « En ce moment » (numeros TNT). */
const SPOTLIGHT_MAX_LCN = 14;
/** « Vient de commencer » : debut depuis moins de... */
const JUST_STARTED_MS = 30 * 60_000;
/** Programmes trop courts (jingles, meteo) : jamais mis en avant. */
const SPOTLIGHT_MIN_LENGTH_MS = 20 * 60_000;

export interface Spotlight {
  group: LineupGroup;
  now: TvNow;
}

/**
 * Programme mis en avant : sur une grande chaine (TNT 1 a 14), celui qui a
 * commence le plus recemment (dans la derniere demi-heure de preference) ; a
 * defaut, celui de la plus petite chaine (TF1 avant M6). null sans guide.
 */
export function pickSpotlight(
  groups: readonly LineupGroup[],
  nowFor: (name: string) => TvNow | null,
  nowMs: number,
): Spotlight | null {
  const candidates: Spotlight[] = [];
  for (const group of groups) {
    if (group.section !== 'tnt' || group.lcn === null || group.lcn > SPOTLIGHT_MAX_LCN) continue;
    const now = nowFor(group.name);
    if (now === null || now.end - now.start < SPOTLIGHT_MIN_LENGTH_MS) continue;
    candidates.push({ group, now });
  }
  if (candidates.length === 0) return null;
  const fresh = candidates.filter((c) => nowMs - c.now.start <= JUST_STARTED_MS);
  if (fresh.length > 0) {
    return fresh.reduce((best, c) =>
      c.now.start > best.now.start || (c.now.start === best.now.start && (c.group.lcn ?? 99) < (best.group.lcn ?? 99))
        ? c
        : best,
    );
  }
  return candidates.reduce((best, c) => ((c.group.lcn ?? 99) < (best.group.lcn ?? 99) ? c : best));
}

export interface ShowcaseRow {
  section: LiveSection;
  label: string;
  /** Pastille de la liste complete (« Tout voir »), si elle existe. */
  view: LiveViewId | null;
  /** Nombre total de chaines de la section. */
  count: number;
  groups: LineupGroup[];
}

/** Cartes par rangee quand une liste complete existe (« Tout voir » pour le reste). */
export const ROW_LIMIT = 20;

/** Rangees par theme, dans l'ordre de la grille (TNT, Canal+, Sport, Info...). */
export function buildShowcaseRows(groups: readonly LineupGroup[]): ShowcaseRow[] {
  const rows: ShowcaseRow[] = [];
  let row: ShowcaseRow | null = null;
  for (const item of buildOverview([...groups])) {
    if (item.kind === 'header') {
      row = { section: item.section, label: item.label, view: item.view, count: item.count, groups: [] };
      rows.push(row);
    } else if (row !== null && (row.view === null || row.groups.length < ROW_LIMIT)) {
      row.groups.push(item.group);
    }
  }
  return rows.filter((r) => r.groups.length > 0);
}
