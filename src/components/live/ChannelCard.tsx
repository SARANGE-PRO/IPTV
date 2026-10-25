'use client';

import Link from 'next/link';
import { memo, type ReactNode } from 'react';
import { ChannelLogo } from '@/components/shared/ChannelLogo';
import type { LiveRowData } from '@/components/live/LiveChannelRow';
import { IconHeart } from '@/components/ui/icons';
import { useLiveChannelActions } from '@/hooks/useLiveChannelActions';
import { cn } from '@/lib/cn';
import type { TvNow } from '@/types/tvGuide';
import { liveHref } from '@/utils/appRoutes';
import { tvProgress } from '@/utils/tvNow';

/** Point rouge « Direct » qui pulse : la chaine qu'on regarde. */
export function LiveDot({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-accent', className)}>
      <span className="h-2 w-2 animate-pulse rounded-full bg-accent motion-reduce:animate-none" />
      Direct
    </span>
  );
}

/** Programme en cours : titre + fine barre d'avancement (ou rien sans guide). */
export function NowLine({ now, nowMs }: { now: TvNow | null | undefined; nowMs: number }) {
  if (now == null) return <span className="mt-0.5 block h-[1.125rem]" aria-hidden />;
  return (
    <>
      <span className="mt-0.5 block truncate text-xs text-fg-muted" title={now.nextTitle ?? undefined}>
        {now.title}
      </span>
      <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-ink-700">
        <span
          className="block h-full rounded-full bg-accent/80"
          style={{ width: `${Math.round(tvProgress(now, nowMs) * 100)}%` }}
        />
      </span>
    </>
  );
}

/** Habillage commun des cartes (rangees, recentes) : logo en grand, nom, programme. */
export function ChannelCardFrame({
  name,
  logoUrl,
  alternates,
  isFrench,
  lcn,
  now,
  nowMs,
  playing,
  favorite = false,
}: {
  name: string;
  logoUrl: string | null;
  alternates?: readonly string[];
  isFrench: boolean;
  lcn?: number | null;
  now?: TvNow | null;
  nowMs: number;
  playing: boolean;
  favorite?: boolean;
}): ReactNode {
  return (
    <>
      <span
        className={cn(
          // Logo centre avec une marge en haut : numero et « Direct » ne le chevauchent pas.
          'relative flex h-24 items-center justify-center rounded-2xl bg-ink-800 pt-3 ring-1 transition-colors group-hover:bg-ink-700',
          playing ? 'ring-2 ring-accent' : 'ring-white/[0.06]',
        )}
      >
        <ChannelLogo
          channel={{ name, logoUrl, isFrench: isFrench ? 1 : 0 }}
          alternates={alternates}
          className="h-12 w-24 bg-transparent"
        />
        {lcn != null && (
          <span className="absolute left-2.5 top-1.5 font-mono text-[11px] tabular-nums text-fg-faint">{lcn}</span>
        )}
        {playing && <LiveDot className="absolute right-2.5 top-1.5" />}
        {favorite && (
          <span role="img" aria-label="Favori" className="absolute bottom-1.5 right-2.5 text-accent">
            <IconHeart className="h-3 w-3" filled />
          </span>
        )}
      </span>
      <span className="mt-2 block truncate text-[13px] font-medium text-fg">{name}</span>
      <NowLine now={now} nowMs={nowMs} />
    </>
  );
}

/**
 * Carte de chaine (vitrine Live) : tap = lecture de la meilleure version,
 * appui long = options (comme la ligne de liste).
 */
function ChannelCardImpl({ row, nowMs, onPlay }: { row: LiveRowData; nowMs: number; onPlay?: (id: string) => void }) {
  const { favoriteId, playingId, longPress } = useLiveChannelActions({
    id: row.id,
    name: row.name,
    versionIds: (row.versions ?? []).map((v) => v.id),
    categoryId: row.categoryId,
    categoryName: row.categoryName,
  });
  return (
    <Link
      href={liveHref(row.id)}
      onClick={() => onPlay?.(row.id)}
      {...longPress}
      className="group block w-[9.5rem] shrink-0 select-none"
    >
      <ChannelCardFrame
        name={row.name}
        logoUrl={row.logoUrl}
        alternates={row.logoAlternates}
        isFrench={row.isFrench === true}
        lcn={row.lcn}
        now={row.now}
        nowMs={nowMs}
        playing={playingId !== null}
        favorite={favoriteId !== null}
      />
    </Link>
  );
}

export const ChannelCard = memo(ChannelCardImpl);
