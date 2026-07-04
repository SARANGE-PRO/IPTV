'use client';

import { useEffect, useState } from 'react';
import type { FootballTeam } from '@/app/api/football/route';
import { cn } from '@/lib/cn';
import { loadCompetitionTeams } from '@/services/football/footballService';
import { FOOTBALL_COMPETITIONS, useFootballStore, type CompetitionInfo } from '@/stores/footballStore';

/**
 * Reglage Football : choix des competitions (nationales + internationales) et
 * des equipes favorites. Le header d'accueil n'affiche QUE les matchs de ces
 * competitions, priorite aux equipes favorites.
 */

function CompChip({ c, active, onToggle }: { c: CompetitionInfo; active: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onToggle}
      className={cn(
        'rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
        active ? 'bg-accent text-white' : 'bg-ink-700 text-fg-muted hover:text-fg',
      )}
    >
      {c.name}
    </button>
  );
}

export function FootballCard() {
  const competitions = useFootballStore((s) => s.competitions);
  const favoriteTeams = useFootballStore((s) => s.favoriteTeams);
  const hydrated = useFootballStore((s) => s.hydrated);
  const hydrate = useFootballStore((s) => s.hydrate);
  const toggleCompetition = useFootballStore((s) => s.toggleCompetition);
  const toggleFavoriteTeam = useFootballStore((s) => s.toggleFavoriteTeam);

  const [pickComp, setPickComp] = useState('');
  const [teams, setTeams] = useState<FootballTeam[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(false);

  useEffect(() => {
    if (!hydrated) void hydrate();
  }, [hydrated, hydrate]);

  useEffect(() => {
    if (pickComp === '') {
      setTeams([]);
      return;
    }
    let active = true;
    setLoadingTeams(true);
    void loadCompetitionTeams(pickComp)
      .then((t) => {
        if (active) setTeams(t);
      })
      .finally(() => {
        if (active) setLoadingTeams(false);
      });
    return () => {
      active = false;
    };
  }, [pickComp]);

  const favIds = new Set(favoriteTeams.map((t) => t.id));
  const international = FOOTBALL_COMPETITIONS.filter((c) => c.kind === 'international');
  const national = FOOTBALL_COMPETITIONS.filter((c) => c.kind === 'national');
  const selectedComps = FOOTBALL_COMPETITIONS.filter((c) => competitions.includes(c.code));

  return (
    <section className="rounded-2xl bg-ink-800 p-5">
      <h2 className="mb-3 text-sm font-semibold text-fg">Football</h2>

      <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-fg-faint">Internationales</p>
      <div className="mb-3 flex flex-wrap gap-2">
        {international.map((c) => (
          <CompChip key={c.code} c={c} active={competitions.includes(c.code)} onToggle={() => void toggleCompetition(c.code)} />
        ))}
      </div>

      <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-fg-faint">Championnats nationaux</p>
      <div className="mb-4 flex flex-wrap gap-2">
        {national.map((c) => (
          <CompChip key={c.code} c={c} active={competitions.includes(c.code)} onToggle={() => void toggleCompetition(c.code)} />
        ))}
      </div>

      <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-fg-faint">Équipes favorites</p>
      {favoriteTeams.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {favoriteTeams.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => void toggleFavoriteTeam(t)}
              className="flex items-center gap-1.5 rounded-full bg-amber-400/15 px-2.5 py-1 text-xs font-medium text-amber-300"
            >
              {t.name}
              <span aria-hidden>✕</span>
            </button>
          ))}
        </div>
      )}

      <select
        value={pickComp}
        onChange={(e) => setPickComp(e.target.value)}
        className="h-10 w-full rounded-xl border border-ink-600 bg-ink-800 px-3 text-sm text-fg outline-none focus:border-accent/70"
      >
        <option value="">Ajouter des équipes depuis une compétition…</option>
        {selectedComps.map((c) => (
          <option key={c.code} value={c.code}>
            {c.name}
          </option>
        ))}
      </select>

      {loadingTeams && <p className="mt-2 text-xs text-fg-faint">Chargement…</p>}
      {teams.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {teams.map((t) => {
            const name = t.short !== '' ? t.short : t.name;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => void toggleFavoriteTeam({ id: t.id, name })}
                className={cn(
                  'rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                  favIds.has(t.id) ? 'bg-amber-400/15 text-amber-300' : 'bg-ink-700 text-fg-muted hover:text-fg',
                )}
              >
                {name}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
