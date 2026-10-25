'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { HScroll } from '@/components/shared/HScroll';
import { ChannelLogo } from '@/components/shared/ChannelLogo';
import { IconClock } from '@/components/ui/actionIcons';
import { useLineupLogos } from '@/hooks/useLineupLogos';
import { useLineupNames } from '@/hooks/useLineupNames';
import { useLongPress } from '@/hooks/useLongPress';
import { cn } from '@/lib/cn';
import { cleanChannelDisplay } from '@/services/live/channelNormalizer';
import { usePlaybackStore } from '@/stores/playbackStore';
import { usePlayerStore } from '@/stores/playerStore';
import { liveHref } from '@/utils/appRoutes';

const MAX_RECENTS = 10;

/** Les 10 dernieres chaines regardees, a un tap (haut de la page Live).
 *  Appui long : retirer la chaine de la liste. */
export function RecentChannelsStrip({ onPlay }: { onPlay?: (id: string) => void }) {
  const recents = usePlaybackStore((s) => s.recentChannels);
  const playingId = usePlayerStore((s) => (s.session?.media.kind === 'live' ? s.session.media.ownerId : null));
  const list = recents.slice(0, MAX_RECENTS);
  const ids = list.map((e) => e.itemId);
  const lineupNames = useLineupNames(ids);
  const lineupLogos = useLineupLogos(ids);
  if (list.length === 0) return null;

  return (
    <section aria-label="Récemment regardées" className="mt-4">
      <h2 className="mb-2 flex items-center gap-1.5 px-1 text-xs font-medium text-fg-muted">
        <IconClock className="h-3.5 w-3.5" />
        Récemment regardées
      </h2>
      <HScroll className="-mx-4 flex gap-3 px-4 pb-1 [scrollbar-width:none] md:-mx-8 md:px-8">
        {list.map((entry) => {
          // Nom de la grille FR, sinon nom fournisseur nettoye (« FR| BEIN SPORTS 1 HD »).
          const raw = entry.label ?? 'Chaîne';
          const name = lineupNames.get(entry.itemId) ?? (cleanChannelDisplay(raw) || raw);
          const playing = entry.itemId === playingId;
          // Logos de toutes les versions de la chaine, puis celui memorise.
          const [logoUrl = null, ...alternates] = [
            ...(lineupLogos.get(entry.itemId) ?? []),
            ...(entry.posterUrl ? [entry.posterUrl] : []),
          ];
          return (
            <RecentLink
              key={entry.itemId}
              itemId={entry.itemId}
              name={name}
              onPlay={onPlay}
            >
              <span
                className={cn(
                  'relative block rounded-2xl p-0.5 ring-1 transition-colors',
                  playing ? 'ring-accent' : 'ring-transparent group-hover:ring-ink-500',
                )}
              >
                <ChannelLogo
                  channel={{ name, logoUrl, isFrench: lineupNames.has(entry.itemId) ? 1 : 0 }}
                  alternates={alternates}
                  className="h-16 w-full rounded-xl"
                />
                {playing && (
                  <span className="absolute bottom-1.5 right-1.5 h-2 w-2 animate-pulse rounded-full bg-accent ring-2 ring-ink-950" />
                )}
              </span>
              <span className="mt-1 block truncate text-center text-[11px] text-fg-muted group-hover:text-fg">
                {name}
              </span>
            </RecentLink>
          );
        })}
      </HScroll>
    </section>
  );
}

function RecentLink({
  itemId,
  name,
  onPlay,
  children,
}: {
  itemId: string;
  name: string;
  onPlay?: (id: string) => void;
  children: ReactNode;
}) {
  const removeRecentChannel = usePlaybackStore((s) => s.removeRecentChannel);
  const longPress = useLongPress(() => {
    if (window.confirm(`Retirer « ${name} » des chaînes récentes ?`)) void removeRecentChannel(itemId);
  });
  return (
    <Link
      href={liveHref(itemId)}
      onClick={() => onPlay?.(itemId)}
      {...longPress}
      className="group w-[4.5rem] shrink-0 select-none"
    >
      {children}
    </Link>
  );
}
