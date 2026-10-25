'use client';

import { useMemo } from 'react';
import { ChannelCard } from '@/components/live/ChannelCard';
import type { LiveRowData } from '@/components/live/LiveChannelRow';
import { LiveSpotlight } from '@/components/live/LiveSpotlight';
import { RecentChannelsStrip } from '@/components/live/RecentChannelsStrip';
import { HScroll } from '@/components/shared/HScroll';
import { IconChevronRight } from '@/components/ui/actionIcons';
import { buildShowcaseRows, pickSpotlight } from '@/services/live/liveShowcase';
import type { LiveViewId } from '@/services/live/liveViews';
import type { LineupGroup } from '@/types/liveLineup';
import type { TvNow } from '@/types/tvGuide';

/**
 * Vitrine Live (vue France) : « En ce moment » (un programme qui vient de
 * commencer sur une grande chaine), chaines recentes en cartes, puis une
 * rangee horizontale par theme (TNT, Canal+, Sport, Info…) avec « Tout voir ».
 * Aucun defilement automatique ; memes gestes que la liste (tap = lecture,
 * appui long = options). Les autres vues restent des listes.
 */
export function LiveShowcase({
  groups,
  toRow,
  nowFor,
  nowMs,
  onPlay,
  onPlayRecent,
  onOpenView,
}: {
  groups: LineupGroup[];
  toRow: (group: LineupGroup) => LiveRowData;
  nowFor: (name: string) => TvNow | null;
  nowMs: number;
  onPlay: () => void;
  onPlayRecent: () => void;
  onOpenView: (view: LiveViewId) => void;
}) {
  // Donnees de cartes recalculees seulement quand la grille, le guide (minute)
  // ou le classement des versions changent : les cartes memo ne bougent pas sinon.
  const rows = useMemo(
    () => buildShowcaseRows(groups).map((row) => ({ ...row, cards: row.groups.map(toRow) })),
    [groups, toRow],
  );
  // Recalcule a la minute (nowMs) : le programme mis en avant suit l'antenne.
  const spotlight = useMemo(() => pickSpotlight(groups, nowFor, nowMs), [groups, nowFor, nowMs]);

  return (
    <div>
      {spotlight !== null && (
        <LiveSpotlight row={toRow(spotlight.group)} now={spotlight.now} nowMs={nowMs} onPlay={onPlay} />
      )}
      <RecentChannelsStrip variant="cards" nowFor={nowFor} nowMs={nowMs} onPlay={onPlayRecent} />
      {rows.map((row) => (
        <section key={row.section} aria-label={row.label} className="mt-6">
          <div className="flex items-center justify-between px-1 pb-2">
            <h2 className="text-sm font-semibold text-fg">
              {row.label} <span className="font-normal text-fg-faint">· {row.count}</span>
            </h2>
            {row.view !== null && (
              <button
                type="button"
                onClick={() => onOpenView(row.view!)}
                className="-my-2 -mr-2 flex h-11 items-center gap-0.5 px-2 text-xs text-fg-muted hover:text-fg"
              >
                Tout voir
                <IconChevronRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <HScroll className="-mx-4 flex gap-3 px-4 pb-1 [scrollbar-width:none] md:-mx-8 md:px-8">
            {row.cards.map((card, i) => (
              <ChannelCard key={row.groups[i]!.key} row={card} nowMs={nowMs} onPlay={onPlay} />
            ))}
          </HScroll>
        </section>
      ))}
    </div>
  );
}
