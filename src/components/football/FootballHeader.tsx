'use client';

import Link from 'next/link';
import { FOOTBALL_HREF } from '@/utils/appRoutes';
import { useMemo, useState } from 'react';
import { FootballMatchModal } from '@/components/football/FootballMatchModal';
import { StatusPill, TeamCrest, TvLine } from '@/components/football/matchUi';
import { HScroll } from '@/components/shared/HScroll';
import { competitionRank } from '@/config/footballCompetitions';
import { useFootballFeed } from '@/hooks/useFootballFeed';
import { cn } from '@/lib/cn';
import { involvesFavorite, isLive } from '@/services/football/footballService';
import type { ChannelRef } from '@/services/football/channelIndex';
import { useFootballStore } from '@/stores/footballStore';
import type { FootballMatch } from '@/types/football';

/**
 * Bandeau foot de l'accueil : matchs EN DIRECT, puis equipes favorites, puis
 * prochaines grosses affiches (aujourd'hui / demain), chacun avec sa chaine
 * TV FR (exacte quand le guide la donne). « Tous les matchs » -> /football.
 */

const MAX_CARDS = 16;
const HORIZON_MS = 36 * 3_600_000;
const RECENT_FINISH_MS = 3 * 3_600_000;

function MatchCard({
  m,
  fav,
  bouquet,
  onClick,
}: {
  m: FootballMatch;
  fav: boolean;
  bouquet: Map<string, ChannelRef | null>;
  onClick: () => void;
}) {
  const live = isLive(m);
  const showScore = live || m.state === 'finished';
  const row = (side: FootballMatch['home']) => (
    <div className="flex items-center gap-2">
      <TeamCrest side={side} className="h-5 w-5" />
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{side.short}</span>
      {showScore && <span className="shrink-0 text-sm font-bold tabular-nums text-fg">{side.score ?? 0}</span>}
    </div>
  );
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-52 shrink-0 flex-col gap-2 rounded-2xl border p-3 text-left shadow-lg shadow-black/30 transition-transform hover:-translate-y-0.5 active:scale-[0.98]',
        live ? 'border-accent/50 bg-accent/[0.07]' : 'border-ink-700/60 bg-ink-800',
        fav && 'ring-1 ring-amber-400/40',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-[10px] font-semibold uppercase tracking-wide text-fg-faint">
          {m.competition.short}
        </span>
        <StatusPill match={m} />
      </div>
      {row(m.home)}
      {row(m.away)}
      <TvLine match={m} bouquet={bouquet} className="border-t border-white/5 pt-1.5" />
    </button>
  );
}

export function FootballHeader() {
  const favorites = useFootballStore((s) => s.favoriteTeams);
  const { matches, bouquet } = useFootballFeed();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const cards = useMemo(() => {
    const now = Date.now();
    const pool = matches.filter(
      (m) =>
        isLive(m) ||
        (m.state === 'scheduled' && m.start <= now + HORIZON_MS) ||
        (m.state === 'finished' && m.start >= now - RECENT_FINISH_MS - 2 * 3_600_000),
    );
    const weight = (m: FootballMatch): number =>
      (isLive(m) ? 1_000_000 : 0) +
      (involvesFavorite(m, favorites) ? 100_000 : 0) +
      (m.state === 'finished' ? -50_000 : 0) +
      competitionRank(m.competition.code) * 100 +
      (m.tv.some((b) => b.confidence === 'confirmed') ? 50 : 0);
    return [...pool]
      .sort((a, b) => weight(b) - weight(a) || a.start - b.start)
      .slice(0, MAX_CARDS)
      .sort((a, b) => Number(isLive(b)) - Number(isLive(a)) || (a.state === 'finished' ? 1 : 0) - (b.state === 'finished' ? 1 : 0) || a.start - b.start);
  }, [matches, favorites]);

  const selected = selectedId !== null ? (matches.find((m) => m.id === selectedId) ?? null) : null;
  // Sans match proche, l'entree vers la page Football reste visible (seul acces).
  if (cards.length === 0) {
    return (
      <Link
        href={FOOTBALL_HREF}
        className="mt-6 flex items-center justify-between rounded-2xl bg-ink-800 px-4 py-3 transition-colors hover:bg-ink-700"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-fg">
          <span className="h-4 w-1 rounded-full bg-accent" aria-hidden />
          Football
          <span className="font-normal text-fg-faint">· calendrier et résultats</span>
        </span>
        <span className="text-xs text-fg-muted">Tous les matchs ›</span>
      </Link>
    );
  }

  return (
    <section className="mt-6">
      <div className="mb-2 flex items-center justify-between px-1">
        <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight text-fg">
          <span className="h-4 w-1 rounded-full bg-accent" aria-hidden />
          Football
          {cards.some(isLive) && (
            <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">Direct</span>
          )}
        </h2>
        <Link href={FOOTBALL_HREF} className="-my-2 -mr-2 px-2 py-3 text-xs text-fg-faint hover:text-fg">
          Tous les matchs
        </Link>
      </div>
      {/* py-2 : laisse la place aux ombres/anneaux des cartes (le scroll horizontal
          rogne sinon verticalement). -my-2 pour ne pas gonfler l'espacement. */}
      <HScroll className="-my-2 flex gap-3 px-0.5 py-2 [-webkit-overflow-scrolling:touch] [scrollbar-width:none]">
        {cards.map((m) => (
          <MatchCard
            key={m.id}
            m={m}
            fav={involvesFavorite(m, favorites)}
            bouquet={bouquet}
            onClick={() => setSelectedId(m.id)}
          />
        ))}
      </HScroll>
      {selected !== null && <FootballMatchModal match={selected} onClose={() => setSelectedId(null)} />}
    </section>
  );
}
