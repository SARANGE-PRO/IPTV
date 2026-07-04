'use client';

import { useEffect, useMemo, useState } from 'react';
import { HScroll } from '@/components/shared/HScroll';
import type { FootballMatch } from '@/app/api/football/route';
import { cn } from '@/lib/cn';
import { isFinishedStatus, isLiveStatus, loadFootballMatches } from '@/services/football/footballService';
import { useFootballStore } from '@/stores/footballStore';

/**
 * Header foot 100% : bandeau des matchs (live + a venir 3 j) des competitions
 * suivies, priorite aux equipes favorites (reglages). Rafraichi toutes les 60 s.
 * Aucun titre (UI minimale). Rien si aucune competition/cle configuree.
 */

const REFRESH_MS = 60_000;

function kickoffLabel(ms: number): string {
  const d = new Date(ms);
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === new Date().toDateString()) return time;
  return `${d.toLocaleDateString('fr-FR', { weekday: 'short' })} ${time}`;
}

function TeamRow({
  crest,
  name,
  goals,
}: {
  crest: string | null;
  name: string;
  goals: number | null;
}) {
  return (
    <div className="flex items-center gap-2">
      {crest !== null ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={crest} alt="" aria-hidden className="h-5 w-5 shrink-0 object-contain" />
      ) : (
        <span className="h-5 w-5 shrink-0 rounded-full bg-ink-600" />
      )}
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{name}</span>
      {goals !== null && <span className="shrink-0 text-sm font-bold tabular-nums text-fg">{goals}</span>}
    </div>
  );
}

function MatchCard({ m, fav }: { m: FootballMatch; fav: boolean }) {
  const live = isLiveStatus(m.status);
  const finished = isFinishedStatus(m.status);
  const showScore = live || finished;
  return (
    <div
      className={cn(
        'flex w-44 shrink-0 flex-col gap-2 rounded-2xl border p-3 shadow-lg shadow-black/30',
        live ? 'border-accent/50 bg-accent/[0.07]' : 'border-ink-700/60 bg-ink-800',
        fav && 'ring-1 ring-amber-400/40',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-[10px] font-semibold uppercase tracking-wide text-fg-faint">
          {m.competition}
        </span>
        {live ? (
          <span className="flex shrink-0 items-center gap-1 text-[10px] font-bold text-accent">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
            {m.minute !== null ? `${m.minute}'` : 'LIVE'}
          </span>
        ) : (
          <span className="shrink-0 text-[10px] font-medium text-fg-faint">
            {finished ? 'Terminé' : kickoffLabel(m.start)}
          </span>
        )}
      </div>
      <TeamRow crest={m.home.crest} name={m.home.short} goals={showScore ? m.home.goals : null} />
      <TeamRow crest={m.away.crest} name={m.away.short} goals={showScore ? m.away.goals : null} />
    </div>
  );
}

export function FootballHeader() {
  const competitions = useFootballStore((s) => s.competitions);
  const favoriteTeams = useFootballStore((s) => s.favoriteTeams);
  const hydrated = useFootballStore((s) => s.hydrated);
  const hydrate = useFootballStore((s) => s.hydrate);
  const [matches, setMatches] = useState<FootballMatch[]>([]);

  useEffect(() => {
    if (!hydrated) void hydrate();
  }, [hydrated, hydrate]);

  useEffect(() => {
    if (!hydrated || competitions.length === 0) {
      setMatches([]);
      return;
    }
    let active = true;
    const load = () => {
      void loadFootballMatches(competitions).then((m) => {
        if (active) setMatches(m);
      });
    };
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [hydrated, competitions]);

  const favIds = useMemo(() => new Set(favoriteTeams.map((t) => t.id)), [favoriteTeams]);
  const involvesFav = (m: FootballMatch): boolean =>
    (m.home.id !== null && favIds.has(m.home.id)) || (m.away.id !== null && favIds.has(m.away.id));

  const sorted = useMemo(() => {
    return [...matches]
      .sort((a, b) => {
        const liveDiff = (isLiveStatus(b.status) ? 1 : 0) - (isLiveStatus(a.status) ? 1 : 0);
        if (liveDiff !== 0) return liveDiff;
        const favDiff = (involvesFav(b) ? 1 : 0) - (involvesFav(a) ? 1 : 0);
        if (favDiff !== 0) return favDiff;
        return a.start - b.start;
      })
      .slice(0, 24);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matches, favIds]);

  if (sorted.length === 0) return null;

  return (
    <section className="mt-4">
      <HScroll className="flex gap-3 pb-1 [-webkit-overflow-scrolling:touch] [scrollbar-width:none]">
        {sorted.map((m) => (
          <MatchCard key={m.id} m={m} fav={involvesFav(m)} />
        ))}
      </HScroll>
    </section>
  );
}
