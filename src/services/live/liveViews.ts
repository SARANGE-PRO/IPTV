import type { LineupGroup, LiveSection } from '@/types/liveLineup';
import type { ChannelTheme } from '@/utils/channelTheme';
import { sectionLabel } from '@/utils/liveSections';

/**
 * Vues de la page Live (pastilles) — logique PURE : quelles chaines, dans quel
 * ordre, sous quels intertitres. Les vues « grille » lisent la grille FR deja
 * rangee ; Favoris / onglets / International / Tous ont leur propre source.
 */

export type TabViewId = `tab:${string}`;

export type LiveViewId =
  | 'france'
  | 'favorites'
  | TabViewId
  | 'tnt'
  | 'canal'
  | 'sport'
  | 'foot'
  | 'news'
  | 'cinema'
  | 'entertainment'
  | 'kids'
  | 'doc'
  | 'music'
  | 'regions'
  | 'francophonie'
  | 'uhd'
  | 'international'
  | 'all';

type LineupViewId = Exclude<LiveViewId, 'favorites' | TabViewId | 'international' | 'all'>;

/** Pastilles de la grille FR, apres France / Favoris / onglets. */
export const LINEUP_VIEWS: readonly { id: LineupViewId; label: string }[] = [
  { id: 'tnt', label: 'TNT' },
  { id: 'canal', label: 'Canal+' },
  { id: 'sport', label: 'Sport' },
  { id: 'foot', label: 'Foot' },
  { id: 'news', label: 'Info' },
  { id: 'cinema', label: 'Cinéma' },
  { id: 'entertainment', label: 'Divertissement' },
  { id: 'kids', label: 'Jeunesse' },
  { id: 'doc', label: 'Découverte' },
  { id: 'music', label: 'Musique' },
  { id: 'regions', label: 'Régions' },
  { id: 'francophonie', label: 'Francophonie' },
  { id: 'uhd', label: '4K' },
];

export const CATALOG_VIEWS: readonly { id: 'international' | 'all'; label: string }[] = [
  { id: 'international', label: 'International' },
  { id: 'all', label: 'Tous' },
];

const THEME_VIEWS: Partial<Record<LiveViewId, ChannelTheme>> = {
  sport: 'sport',
  news: 'news',
  cinema: 'cinema',
  entertainment: 'entertainment',
  kids: 'kids',
  doc: 'doc',
  music: 'music',
};

const SECTION_VIEWS: Partial<Record<LiveViewId, LiveSection>> = {
  tnt: 'tnt',
  canal: 'canal',
  regions: 'regions',
  francophonie: 'francophonie',
};

export const tabViewId = (tabId: string): TabViewId => `tab:${tabId}`;

export function tabIdOf(view: LiveViewId): string | null {
  return view.startsWith('tab:') ? view.slice(4) : null;
}

export function isLineupView(view: LiveViewId): view is LineupViewId {
  return view === 'france' || LINEUP_VIEWS.some((v) => v.id === view);
}

/** Libelle de vue (zapping, compteurs). */
export function viewLabel(view: LiveViewId, tabName?: string): string {
  if (view === 'france') return 'France';
  if (view === 'favorites') return 'Favoris';
  if (tabIdOf(view) !== null) return tabName ?? 'Onglet';
  return [...LINEUP_VIEWS, ...CATALOG_VIEWS].find((v) => v.id === view)?.label ?? 'Live';
}

/**
 * Retire les versions dont la categorie est masquee (blacklist) ; une chaine
 * dont toutes les versions sont masquees disparait.
 */
export function withoutHidden(groups: LineupGroup[], hidden: ReadonlySet<string>): LineupGroup[] {
  if (hidden.size === 0) return groups;
  const out: LineupGroup[] = [];
  for (const group of groups) {
    const versions = group.versions.filter((v) => !hidden.has(v.categoryId));
    if (versions.length === group.versions.length) out.push(group);
    else if (versions.length > 0) out.push({ ...group, versions });
  }
  return out;
}

/** Chaines d'une vue grille, dans l'ordre de la grille. */
export function filterLineup(groups: LineupGroup[], view: LineupViewId): LineupGroup[] {
  if (view === 'france') return groups;
  if (view === 'foot') return groups.filter((g) => g.isFootball);
  if (view === 'uhd') return groups.filter((g) => g.versions.some((v) => v.isUhd === 1));
  const section = SECTION_VIEWS[view];
  if (section !== undefined) return groups.filter((g) => g.section === section);
  const theme = THEME_VIEWS[view];
  return theme !== undefined ? groups.filter((g) => g.theme === theme) : groups;
}

export type OverviewItem =
  | { kind: 'header'; section: LiveSection; label: string; count: number; view: LiveViewId | null }
  | { kind: 'group'; group: LineupGroup };

/** Pastille correspondant a une section (intertitre cliquable), si elle existe. */
function viewOfSection(section: LiveSection): LiveViewId | null {
  switch (section) {
    case 'tnt':
    case 'canal':
    case 'sport':
    case 'news':
    case 'cinema':
    case 'kids':
    case 'doc':
    case 'music':
    case 'regions':
    case 'francophonie':
      return section;
    case 'series':
      return 'entertainment';
    default:
      return null;
  }
}

/** Vue France : toute la grille, intertitre avant chaque section. */
export function buildOverview(groups: LineupGroup[]): OverviewItem[] {
  const counts = new Map<LiveSection, number>();
  for (const g of groups) counts.set(g.section, (counts.get(g.section) ?? 0) + 1);
  const items: OverviewItem[] = [];
  let current: LiveSection | null = null;
  for (const group of groups) {
    if (group.section !== current) {
      current = group.section;
      items.push({
        kind: 'header',
        section: current,
        label: sectionLabel(current),
        count: counts.get(current) ?? 0,
        view: viewOfSection(current),
      });
    }
    items.push({ kind: 'group', group });
  }
  return items;
}

const LEGACY_VIEWS: Record<string, LiveViewId> = { main: 'tnt', recent: 'france' };

/** Vue memorisee -> vue valide (anciennes valeurs, onglet supprime…). */
export function restoreView(saved: string | undefined, tabIds: readonly string[]): LiveViewId {
  if (saved === undefined) return 'france';
  const legacy = LEGACY_VIEWS[saved];
  if (legacy !== undefined) return legacy;
  if (saved.startsWith('tab:')) return tabIds.includes(saved.slice(4)) ? (saved as TabViewId) : 'favorites';
  const known: string[] = ['france', 'favorites', ...LINEUP_VIEWS.map((v) => v.id), ...CATALOG_VIEWS.map((v) => v.id)];
  return known.includes(saved) ? (saved as LiveViewId) : 'france';
}
