'use client';

import { useEffect, useRef } from 'react';
import { ChannelLogo } from '@/components/shared/ChannelLogo';
import { cn } from '@/lib/cn';
import type { ZapListItem } from '@/services/live/liveZappingService';
import type { TvNow } from '@/types/tvGuide';
import { tvProgress } from '@/utils/tvNow';

/**
 * Liste des chaines a cote du lecteur (iPad / grand ecran) : on zappe en
 * touchant une chaine, la video reste a l'ecran. Composant de presentation.
 */
export function ChannelSidebar({
  label,
  items,
  isCurrent,
  nowFor,
  onSelect,
}: {
  label: string;
  items: ZapListItem[];
  isCurrent: (item: ZapListItem) => boolean;
  nowFor: (name: string) => TvNow | null;
  onSelect: (id: string) => void;
}) {
  const currentRef = useRef<HTMLButtonElement | null>(null);
  const currentKey = items.find(isCurrent)?.id ?? null;

  // La chaine en cours reste visible dans la liste (zapping au clavier, ⏮ ⏭).
  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: 'nearest' });
  }, [currentKey]);

  return (
    <aside className="hidden lg:sticky lg:top-6 lg:block lg:max-h-[calc(100dvh-3rem)] lg:overflow-y-auto lg:rounded-2xl lg:bg-ink-900/60 lg:p-2 phone-land:hidden">
      <p className="px-2 pb-2 pt-1 text-[11px] font-medium uppercase tracking-wide text-fg-faint">{label}</p>
      <div className="flex flex-col">
        {items.map((item) => {
          const current = isCurrent(item);
          const now = item.isFrench ? nowFor(item.name) : null;
          return (
            <button
              key={item.groupKey ?? item.id}
              ref={current ? currentRef : undefined}
              type="button"
              onClick={() => onSelect(item.id)}
              aria-current={current ? 'true' : undefined}
              className={cn(
                'flex min-h-[3.25rem] items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition-colors',
                current ? 'bg-accent/15' : 'hover:bg-ink-800',
              )}
            >
              <span className="w-5 shrink-0 text-right font-mono text-[10px] tabular-nums text-fg-faint">
                {item.lcn ?? ''}
              </span>
              <ChannelLogo
                channel={{ name: item.name, logoUrl: item.logos[0] ?? null, isFrench: item.isFrench ? 1 : 0 }}
                alternates={item.logos.slice(1)}
                className="h-9 w-9 shrink-0"
              />
              <span className="min-w-0 flex-1">
                <span className={cn('block truncate text-sm', current ? 'font-medium text-fg' : 'text-fg')}>
                  {item.name}
                </span>
                {now !== null && (
                  <>
                    <span className="block truncate text-[11px] text-fg-muted">{now.title}</span>
                    <span className="mt-0.5 block h-0.5 overflow-hidden rounded-full bg-ink-600">
                      <span
                        className="block h-full rounded-full bg-accent/70"
                        style={{ width: `${Math.round(tvProgress(now, Date.now()) * 100)}%` }}
                      />
                    </span>
                  </>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
