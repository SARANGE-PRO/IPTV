'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { findNextMatch, type NextMatch } from '@/services/live/nextMatchService';
import { displayChannelName } from '@/utils/displayTitle';
import type { XtreamCredentials } from '@/types/xtream';

/**
 * Bandeau "prochain match" en tete d'accueil : le prochain match foot a venir
 * (France / PSG prioritaires) et la chaine pour le regarder. Rien ne s'affiche
 * si aucun match n'est trouve — jamais bloquant.
 */
function whenLabel(start: number): string {
  const d = new Date(start);
  const day = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' });
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay ? `Aujourd’hui à ${time}` : `${day} · ${time}`;
}

export function NextMatchBanner({ credentials }: { credentials: XtreamCredentials | null }) {
  const [match, setMatch] = useState<NextMatch | null>(null);

  useEffect(() => {
    if (credentials === null) return;
    let active = true;
    void findNextMatch(credentials)
      .then((m) => {
        if (active) setMatch(m);
      })
      .catch(() => {
        // EPG indispo : le bandeau reste simplement absent.
      });
    return () => {
      active = false;
    };
  }, [credentials]);

  if (match === null) return null;

  return (
    <Link
      href={`/live/${match.channelId}`}
      className="glow-accent group relative mt-4 block overflow-hidden rounded-2xl border border-accent/30 p-4 transition-transform active:scale-[0.99]"
    >
      {/* Fond degrade accent. */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-accent/25 via-accent/5 to-transparent" />
      <div className="relative flex items-center gap-4">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-accent/20 text-2xl">⚽</div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-accent">
            {match.priority ? 'À ne pas manquer' : 'Prochain match'}
          </p>
          <p className="mt-0.5 truncate text-sm font-semibold text-fg">{match.title}</p>
          <p className="mt-0.5 truncate text-xs text-fg-muted">
            {whenLabel(match.start)} · {displayChannelName(match.channelName)}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-accent px-4 py-2 text-xs font-semibold text-white transition-colors group-hover:bg-accent-hover">
          Regarder
        </span>
      </div>
    </Link>
  );
}
