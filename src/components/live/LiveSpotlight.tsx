'use client';

import Link from 'next/link';
import { LiveDot } from '@/components/live/ChannelCard';
import type { LiveRowData } from '@/components/live/LiveChannelRow';
import { ChannelLogo } from '@/components/shared/ChannelLogo';
import { IconPlay } from '@/components/ui/icons';
import { useLiveChannelActions } from '@/hooks/useLiveChannelActions';
import type { TvNow } from '@/types/tvGuide';
import { liveHref } from '@/utils/appRoutes';
import { tvProgress } from '@/utils/tvNow';

const hour = (ms: number): string => new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

/**
 * Grande carte « En ce moment » : un programme qui vient de commencer sur une
 * grande chaine (voir pickSpotlight). Logo en grand, titre, horaire, barre
 * d'avancement, « Regarder ». Une seule carte, aucune rotation.
 */
export function LiveSpotlight({
  row,
  now,
  nowMs,
  onPlay,
}: {
  row: LiveRowData;
  now: TvNow;
  nowMs: number;
  onPlay?: (id: string) => void;
}) {
  const { playingId, longPress } = useLiveChannelActions({
    id: row.id,
    name: row.name,
    versionIds: (row.versions ?? []).map((v) => v.id),
    categoryId: row.categoryId,
    categoryName: row.categoryName,
  });
  const startedMin = Math.max(0, Math.round((nowMs - now.start) / 60_000));
  return (
    <Link
      href={liveHref(row.id)}
      onClick={() => onPlay?.(row.id)}
      {...longPress}
      aria-label={`Regarder ${now.title} sur ${row.name}`}
      className="group mt-4 block select-none overflow-hidden rounded-3xl bg-gradient-to-br from-ink-700 via-ink-800 to-ink-900 p-5 ring-1 ring-white/[0.06]"
    >
      <span className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-accent">En ce moment</span>
        {playingId !== null && <LiveDot />}
      </span>
      <span className="mt-4 flex items-center gap-4">
        <ChannelLogo
          channel={{ name: row.name, logoUrl: row.logoUrl, isFrench: row.isFrench === true ? 1 : 0 }}
          alternates={row.logoAlternates}
          className="h-20 w-20 shrink-0 rounded-2xl bg-ink-900/60 p-2"
        />
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-medium text-fg-muted">
            {row.lcn != null ? `${row.lcn} · ` : ''}
            {row.name}
          </span>
          <span className="mt-1 line-clamp-2 block text-xl font-bold leading-tight tracking-tight text-fg">
            {now.title}
          </span>
        </span>
      </span>
      <span className="mt-4 flex items-center justify-between text-xs tabular-nums text-fg-muted">
        <span>
          {hour(now.start)} – {hour(now.end)}
        </span>
        <span>{startedMin < 1 ? 'Vient de commencer' : `Commencé il y a ${startedMin} min`}</span>
      </span>
      <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-ink-600">
        <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.round(tvProgress(now, nowMs) * 100)}%` }} />
      </span>
      <span className="mt-5 inline-flex h-11 items-center gap-2 rounded-xl bg-white px-6 text-[15px] font-semibold text-black transition-colors group-hover:bg-white/85">
        <IconPlay className="h-5 w-5" />
        Regarder
      </span>
    </Link>
  );
}
