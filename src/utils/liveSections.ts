import type { LiveSection } from '@/types/liveLineup';
import type { ChannelTheme } from '@/utils/channelTheme';

/** Sections de la vue France, dans l'ordre d'affichage (= ordre de tri). */
export const LIVE_SECTIONS: readonly { id: LiveSection; label: string }[] = [
  { id: 'tnt', label: 'TNT' },
  { id: 'canal', label: 'Canal+' },
  { id: 'sport', label: 'Sport' },
  { id: 'news', label: 'Info' },
  { id: 'cinema', label: 'Cinéma' },
  { id: 'series', label: 'Séries & divertissement' },
  { id: 'kids', label: 'Jeunesse' },
  { id: 'doc', label: 'Découverte' },
  { id: 'music', label: 'Musique' },
  { id: 'regions', label: 'Régions & Outre-mer' },
  { id: 'h247', label: 'Chaînes 24/7' },
  { id: 'other', label: 'Autres chaînes' },
  { id: 'francophonie', label: 'Francophonie' },
];

const ORDER = new Map<LiveSection, number>(LIVE_SECTIONS.map((s, i) => [s.id, i]));

export function sectionOrder(section: LiveSection): number {
  return ORDER.get(section) ?? LIVE_SECTIONS.length;
}

export function sectionLabel(section: LiveSection): string {
  return LIVE_SECTIONS.find((s) => s.id === section)?.label ?? section;
}

/** Section d'une chaine inconnue du referentiel, d'apres son theme. */
export function sectionOfTheme(theme: ChannelTheme): LiveSection {
  switch (theme) {
    case 'sport':
    case 'news':
    case 'cinema':
    case 'kids':
    case 'doc':
    case 'music':
      return theme;
    case 'entertainment':
      return 'series';
    default:
      return 'other';
  }
}
