'use client';

import Link from 'next/link';
import { HScroll } from '@/components/shared/HScroll';
import { ChannelLogo } from '@/components/shared/ChannelLogo';
import { IconClock } from '@/components/ui/actionIcons';
import { useLineupNames } from '@/hooks/useLineupNames';
import { cn } from '@/lib/cn';
import { cleanChannelDisplay } from '@/services/live/channelNormalizer';
import { usePlaybackStore } from '@/stores/playbackStore';
import { usePlayerStore } from '@/stores/playerStore';
import { liveHref } from '@/utils/appRoutes';

const MAX_RECENTS = 10;

/** Les 10 dernieres chaines regardees, a un tap (haut de la page Live). */
export function RecentChannelsStrip({ onPlay }: { onPlay?: (id: string) => void }) {
  const recents = usePlaybackStore((s) => s.recentChannels);
  const playingId = usePlayerStore((s) => (s.session?.media.kind === 'live' ? s.session.media.ownerId : null));
  const list = recents.slice(0, MAX_RECENTS);
  const lineupNames = useLineupNames(list.map((e) => e.itemId));
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
          return (
            <Link
              key={entry.itemId}
              href={liveHref(entry.itemId)}
              onClick={() => onPlay?.(entry.itemId)}
              className="group w-[4.5rem] shrink-0"
            >
              <span
                className={cn(
                  'relative block rounded-2xl p-0.5 ring-1 transition-colors',
                  playing ? 'ring-accent' : 'ring-transparent group-hover:ring-ink-500',
                )}
              >
                <ChannelLogo channel={{ name, logoUrl: entry.posterUrl ?? null }} className="h-16 w-full rounded-xl" />
                {playing && (
                  <span className="absolute bottom-1.5 right-1.5 h-2 w-2 animate-pulse rounded-full bg-accent ring-2 ring-ink-950" />
                )}
              </span>
              <span className="mt-1 block truncate text-center text-[11px] text-fg-muted group-hover:text-fg">
                {name}
              </span>
            </Link>
          );
        })}
      </HScroll>
    </section>
  );
}
