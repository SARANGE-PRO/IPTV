'use client';

import Link from 'next/link';
import { HScroll } from '@/components/shared/HScroll';
import { cn } from '@/lib/cn';
import type { SportEvent, SportKind } from '@/services/live/sportEventsService';
import { displayChannelName } from '@/utils/displayTitle';

/**
 * Rail d'evenements sportifs a venir (foot + MMA) : le plus proche en tete, on
 * defile pour les suivants. Chaque carte pointe vers la chaine qui le diffuse.
 */

const KIND_ICON: Record<SportKind, string> = { foot: '⚽', mma: '🥊', sport: '🏆' };

function whenLabel(start: number): string {
  const d = new Date(start);
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const sameDay = d.toDateString() === new Date().toDateString();
  if (sameDay) return `Aujourd’hui ${time}`;
  const day = d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
  return `${day} · ${time}`;
}

function EventCard({ event }: { event: SportEvent }) {
  return (
    <Link
      href={`/live/${event.channelId}`}
      className={cn(
        'group relative flex w-72 shrink-0 flex-col justify-between overflow-hidden rounded-2xl border p-4 transition-transform active:scale-[0.98]',
        event.priority
          ? 'glow-accent border-accent/40'
          : 'border-white/[0.06] shadow-lg shadow-black/40',
      )}
    >
      {event.priority && (
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-accent/20 via-accent/5 to-transparent" />
      )}
      <div className="relative flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-ink-700 text-xl">
          {KIND_ICON[event.kind]}
        </span>
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              'text-[11px] font-semibold uppercase tracking-wider',
              event.priority ? 'text-accent' : 'text-fg-faint',
            )}
          >
            {event.priority ? 'À ne pas manquer' : whenLabel(event.start)}
          </p>
          <p className="mt-0.5 line-clamp-2 text-sm font-semibold leading-snug text-fg">{event.title}</p>
        </div>
      </div>
      <div className="relative mt-3 flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-xs text-fg-muted">
          {event.priority ? whenLabel(event.start) : displayChannelName(event.channelName)}
        </span>
        <span className="shrink-0 rounded-full bg-accent px-3 py-1 text-[11px] font-semibold text-white transition-colors group-hover:bg-accent-hover">
          Regarder
        </span>
      </div>
    </Link>
  );
}

export function SportEventsRail({ events, title }: { events: SportEvent[]; title: string }) {
  if (events.length === 0) return null;
  return (
    <section className="mt-6">
      <h2 className="mb-2 px-1 text-sm font-semibold text-fg">{title}</h2>
      <HScroll className="flex gap-3 pb-1 [scrollbar-width:none]">
        {events.map((event) => (
          <EventCard key={`${event.channelId}:${event.start}`} event={event} />
        ))}
      </HScroll>
    </section>
  );
}
