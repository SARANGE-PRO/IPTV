'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ReminderButton } from '@/components/notifications/ReminderButton';
import { cn } from '@/lib/cn';
import type { SportEvent } from '@/services/live/sportEventsService';

/**
 * Billboard immersif des gros evenements sportifs a venir (foot / MMA), en haut
 * de l'accueil. Auto-rotation douce + compte a rebours live. CTA -> chaine Live.
 */

const KIND_LABEL: Record<SportEvent['kind'], string> = { foot: 'Football', mma: 'MMA / Combat', sport: 'Sport' };
const KIND_GRADIENT: Record<SportEvent['kind'], string> = {
  foot: 'from-emerald-600/40 via-ink-900 to-ink-950',
  mma: 'from-rose-700/40 via-ink-900 to-ink-950',
  sport: 'from-accent/35 via-ink-900 to-ink-950',
};

function countdown(start: number, now: number): string {
  const diff = start - now;
  if (diff <= 0) return 'En cours';
  const min = Math.round(diff / 60_000);
  if (min < 60) return `dans ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) {
    const rest = min % 60;
    return rest > 0 ? `dans ${h} h ${String(rest).padStart(2, '0')}` : `dans ${h} h`;
  }
  return new Date(start).toLocaleString('fr-FR', { weekday: 'long', hour: '2-digit', minute: '2-digit' });
}

export function SportHero({ events }: { events: SportEvent[] }) {
  // Vedettes : gros evenements / priorite France d'abord, puis les plus proches.
  const featured = useMemo(
    () =>
      [...events]
        .sort((a, b) => Number(b.major) - Number(a.major) || Number(b.priority) - Number(a.priority) || a.start - b.start)
        .slice(0, 5),
    [events],
  );

  const [index, setIndex] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setIndex(0);
  }, [featured.length]);

  useEffect(() => {
    if (featured.length <= 1) return;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    const rot = setInterval(() => setIndex((i) => (i + 1) % featured.length), 6_000);
    return () => {
      clearInterval(id);
      clearInterval(rot);
    };
  }, [featured.length]);

  if (featured.length === 0) return null;
  const ev = featured[index] ?? featured[0];
  if (ev === undefined) return null;

  return (
    <section className="mt-4">
      <div
        className={cn(
          'relative overflow-hidden rounded-3xl border border-ink-700/60 bg-gradient-to-br p-5 shadow-xl shadow-black/40 sm:p-7',
          KIND_GRADIENT[ev.kind],
        )}
      >
        {/* Halo decoratif */}
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/5 blur-3xl" />

        <div className="relative flex items-center gap-2">
          <span className="rounded-full bg-black/40 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-white/90">
            {KIND_LABEL[ev.kind]}
          </span>
          {ev.priority && (
            <span className="rounded-full bg-accent/90 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-white">
              À la une
            </span>
          )}
          <span className="ml-auto rounded-full bg-black/40 px-2.5 py-1 text-[11px] font-semibold text-white/90">
            {countdown(ev.start, now)}
          </span>
        </div>

        <h2 className="relative mt-3 line-clamp-2 text-xl font-bold leading-tight text-white drop-shadow sm:text-2xl">
          {ev.title}
        </h2>
        <p className="relative mt-1 truncate text-sm text-white/70">{ev.channelName}</p>

        <div className="relative mt-5 flex items-center gap-3">
          <Link
            href={`/live/${ev.channelId}`}
            className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-ink-950 transition-transform hover:scale-[1.03] active:scale-95"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
              <path d="M8 5v14l11-7z" />
            </svg>
            Regarder
          </Link>

          <ReminderButton event={ev} />

          {featured.length > 1 && (
            <div className="ml-auto flex gap-1.5">
              {featured.map((f, i) => (
                <button
                  key={f.channelId + f.start}
                  type="button"
                  aria-label={`Événement ${i + 1}`}
                  onClick={() => setIndex(i)}
                  className={cn(
                    'h-1.5 rounded-full transition-all',
                    i === index ? 'w-6 bg-white' : 'w-1.5 bg-white/40 hover:bg-white/70',
                  )}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
