'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { FootballMatchModal } from '@/components/football/FootballMatchModal';
import { StatusPill, TeamCrest, TvLine } from '@/components/football/matchUi';
import { BrandMark } from '@/components/shared/BrandMark';
import { EmptyState } from '@/components/shared/EmptyState';
import { HScroll } from '@/components/shared/HScroll';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { COMPETITION_BY_CODE, competitionRank } from '@/config/footballCompetitions';
import { useFootballFeed } from '@/hooks/useFootballFeed';
import { cn } from '@/lib/cn';
import type { ChannelRef } from '@/services/football/channelIndex';
import { involvesFavorite, isLive } from '@/services/football/footballService';
import { useFootballStore } from '@/stores/footballStore';
import type { FootballMatch } from '@/types/football';
import { secureImageSrc } from '@/utils/secureUrl';

/**
 * PROGRAMME FOOT : tous les matchs des competitions suivies, jour par jour,
 * score/minute en direct et chaine TV FR de chaque match (exacte quand le
 * guide TV la donne, sinon diffuseur probable). Toucher un match ouvre sa
 * fiche (« Regarder » sur la chaine du bouquet, rappel).
 */

const DAY_MS = 86_400_000;

function dayStart(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function dayLabel(start: number, today: number): string {
  const diff = Math.round((start - today) / DAY_MS);
  if (diff === -1) return 'Hier';
  if (diff === 0) return "Aujourd'hui";
  if (diff === 1) return 'Demain';
  return new Date(start).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' });
}

function MatchRow({
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
  const showScore = isLive(m) || m.state === 'finished';
  const side = (s: FootballMatch['home'], won: boolean) => (
    <div className="flex min-w-0 items-center gap-2">
      <TeamCrest side={s} className="h-5 w-5" />
      <span className={cn('min-w-0 flex-1 truncate text-sm', won ? 'font-semibold text-fg' : 'text-fg')}>{s.name}</span>
      {showScore && <span className="shrink-0 text-sm font-bold tabular-nums text-fg">{s.score ?? 0}</span>}
    </div>
  );
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-stretch gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-ink-800',
        isLive(m) && 'bg-accent/[0.06]',
        fav && 'ring-1 ring-inset ring-amber-400/30',
      )}
    >
      <div className="flex w-12 shrink-0 flex-col items-start justify-center">
        <StatusPill match={m} compact />
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        {side(m.home, m.home.winner === true)}
        {side(m.away, m.away.winner === true)}
        <TvLine match={m} bouquet={bouquet} />
      </div>
    </button>
  );
}

function CompetitionLogo({ src, className }: { src: string | null; className?: string }) {
  const url = secureImageSrc(src);
  if (url === null) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" aria-hidden className={cn('object-contain', className)} />;
}

export default function FootballPage() {
  const favorites = useFootballStore((s) => s.favoriteTeams);
  const { matches, guide, failed, loading, error, bouquet, refresh } = useFootballFeed();
  const today = dayStart(Date.now());
  const [day, setDay] = useState(today);
  const [comp, setComp] = useState<string | null>(null);
  const [frOnly, setFrOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const days = useMemo(() => Array.from({ length: 9 }, (_, i) => today + (i - 1) * DAY_MS), [today]);
  const liveNow = useMemo(() => matches.filter(isLive), [matches]);
  const countByDay = useMemo(() => {
    const map = new Map<number, number>();
    for (const m of matches) map.set(dayStart(m.start), (map.get(dayStart(m.start)) ?? 0) + 1);
    return map;
  }, [matches]);

  const ofDay = useMemo(
    () =>
      matches.filter(
        (m) =>
          dayStart(m.start) === day &&
          (comp === null || m.competition.code === comp) &&
          (!frOnly || m.tv.length > 0),
      ),
    [matches, day, comp, frOnly],
  );

  const competitionsOfDay = useMemo(() => {
    const map = new Map<string, FootballMatch['competition']>();
    for (const m of matches) if (dayStart(m.start) === day) map.set(m.competition.code, m.competition);
    return [...map.values()].sort((a, b) => competitionRank(b.code) - competitionRank(a.code));
  }, [matches, day]);

  const groups = useMemo(() => {
    const map = new Map<string, FootballMatch[]>();
    for (const m of ofDay) {
      if (day === today && isLive(m) && comp === null && !frOnly) continue; // deja dans « En direct »
      const list = map.get(m.competition.code) ?? [];
      list.push(m);
      map.set(m.competition.code, list);
    }
    return [...map.entries()]
      .sort((a, b) => competitionRank(b[0]) - competitionRank(a[0]))
      .map(([code, list]) => ({
        code,
        competition: list[0]!.competition,
        matches: list.sort((x, y) => x.start - y.start || Number(involvesFavorite(y, favorites)) - Number(involvesFavorite(x, favorites))),
      }));
  }, [ofDay, day, today, comp, frOnly, favorites]);

  const selected = selectedId !== null ? (matches.find((m) => m.id === selectedId) ?? null) : null;
  const showLiveBlock = day === today && comp === null && !frOnly && liveNow.length > 0;
  const pill = (on: boolean) =>
    cn(
      'flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-medium transition-colors',
      on ? 'bg-accent text-white' : 'bg-ink-800 text-fg-muted hover:text-fg',
    );

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-6 md:px-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight text-fg">Football</h1>
        <div className="md:hidden">
          <BrandMark />
        </div>
      </div>

      {/* Jours */}
      <HScroll className="-mx-4 mt-4 flex gap-2 px-4 pb-1 [scrollbar-width:none] md:mx-0 md:px-0">
        {days.map((d) => {
          const n = countByDay.get(d) ?? 0;
          const hasLive = d === today && liveNow.length > 0;
          return (
            <button key={d} type="button" onClick={() => setDay(d)} className={pill(d === day)} aria-pressed={d === day}>
              {hasLive && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />}
              <span className="capitalize">{dayLabel(d, today)}</span>
              {n > 0 && <span className={cn('text-[11px]', d === day ? 'text-white/75' : 'text-fg-faint')}>{n}</span>}
            </button>
          );
        })}
      </HScroll>

      {/* Competitions du jour + filtre diffusion FR */}
      <HScroll className="-mx-4 mt-2 flex gap-2 px-4 pb-1 [scrollbar-width:none] md:mx-0 md:px-0">
        <button type="button" onClick={() => setComp(null)} className={pill(comp === null)}>
          Toutes
        </button>
        <button type="button" onClick={() => setFrOnly((v) => !v)} className={pill(frOnly)} aria-pressed={frOnly}>
          Diffusés en France
        </button>
        {competitionsOfDay.map((c) => (
          <button
            key={c.code}
            type="button"
            onClick={() => setComp(comp === c.code ? null : c.code)}
            className={pill(comp === c.code)}
          >
            <CompetitionLogo src={c.logo} className="h-4 w-4" />
            {c.short}
          </button>
        ))}
      </HScroll>

      {guide === 'loading' && (
        <p className="mt-3 text-[11px] text-fg-faint">Recherche des chaînes TV exactes dans le guide… (chaînes probables en attendant)</p>
      )}
      {guide === 'unavailable' && !loading && (
        <p className="mt-3 text-[11px] text-amber-300/80">Guide TV momentanément indisponible : chaînes probables uniquement.</p>
      )}
      {failed.length > 0 && !loading && (
        <p className="mt-1 text-[11px] text-fg-faint">
          Indisponible pour l’instant : {failed.map((c) => COMPETITION_BY_CODE.get(c)?.short ?? c).join(', ')}
        </p>
      )}

      {loading ? (
        <div className="mt-6 space-y-2">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : error && matches.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            title="Matchs indisponibles"
            hint="Impossible de joindre le service des matchs. Vérifie ta connexion."
            action={
              <Button size="sm" variant="secondary" onClick={refresh}>
                Réessayer
              </Button>
            }
          />
        </div>
      ) : (
        <>
          {showLiveBlock && (
            <section className="mt-6">
              <h2 className="mb-1 flex items-center gap-2 px-3 text-sm font-semibold text-fg">
                <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
                En direct
              </h2>
              <div className="flex flex-col">
                {liveNow.map((m) => (
                  <MatchRow
                    key={m.id}
                    m={m}
                    fav={involvesFavorite(m, favorites)}
                    bouquet={bouquet}
                    onClick={() => setSelectedId(m.id)}
                  />
                ))}
              </div>
            </section>
          )}

          {groups.map((g) => (
            <section key={g.code} className="mt-6">
              <h2 className="mb-1 flex items-center gap-2 px-3 text-sm font-semibold text-fg">
                <CompetitionLogo src={g.competition.logo} className="h-5 w-5" />
                {g.competition.name}
              </h2>
              <div className="flex flex-col">
                {g.matches.map((m) => (
                  <MatchRow
                    key={m.id}
                    m={m}
                    fav={involvesFavorite(m, favorites)}
                    bouquet={bouquet}
                    onClick={() => setSelectedId(m.id)}
                  />
                ))}
              </div>
            </section>
          ))}

          {groups.length === 0 && !showLiveBlock && (
            <div className="mt-8">
              <EmptyState
                title={frOnly || comp !== null ? 'Aucun match pour ce filtre' : 'Aucun match ce jour-là'}
                hint="Les compétitions suivies se règlent dans Réglages › Football."
                action={
                  <Link href="/settings" className="text-sm font-semibold text-accent hover:underline">
                    Choisir mes compétitions
                  </Link>
                }
              />
            </div>
          )}
        </>
      )}

      {selected !== null && <FootballMatchModal match={selected} onClose={() => setSelectedId(null)} />}
    </main>
  );
}
