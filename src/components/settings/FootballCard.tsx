'use client';

import { useEffect, useState } from 'react';
import {
  COMPETITION_GROUP_LABEL,
  FOOTBALL_COMPETITIONS,
  type CompetitionDef,
  type CompetitionGroup,
} from '@/config/footballCompetitions';
import { cn } from '@/lib/cn';
import { loadCompetitionTeams } from '@/services/football/footballService';
import { useFootballStore } from '@/stores/footballStore';
import type { FootballTeam } from '@/types/football';
import { secureImageSrc } from '@/utils/secureUrl';

/**
 * Reglage Football : competitions suivies (coupes d'Europe, championnats,
 * coupes nationales, selections) et equipes favorites (mises en avant dans
 * le bandeau d'accueil et la page Football).
 */

const GROUPS: CompetitionGroup[] = ['europe', 'league', 'cup', 'nations'];

function CompChip({ c, active, onToggle }: { c: CompetitionDef; active: boolean; onToggle: () => void }) {
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
      .then((t) => active && setTeams(t))
      .finally(() => active && setLoadingTeams(false));
    return () => {
      active = false;
    };
  }, [pickComp]);

  const favIds = new Set(favoriteTeams.map((t) => t.id));
  // Equipes : championnats et selections (les coupes reprennent les memes clubs).
  const teamSources = FOOTBALL_COMPETITIONS.filter((c) => c.group === 'league' || c.code === 'uefa.nations');

  return (
    <section className="rounded-2xl bg-ink-800 p-5">
      <h2 className="mb-1 text-sm font-semibold text-fg">Football</h2>
      <p className="mb-4 text-[11px] leading-relaxed text-fg-faint">
        Matchs, scores en direct et chaîne TV de chaque match en France (guide TV), pour les compétitions choisies.
      </p>

      {GROUPS.map((group) => (
        <div key={group} className="mb-3">
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-fg-faint">{COMPETITION_GROUP_LABEL[group]}</p>
          <div className="flex flex-wrap gap-2">
            {FOOTBALL_COMPETITIONS.filter((c) => c.group === group).map((c) => (
              <CompChip key={c.code} c={c} active={competitions.includes(c.code)} onToggle={() => void toggleCompetition(c.code)} />
            ))}
          </div>
        </div>
      ))}

      <p className="mb-1.5 mt-4 text-[11px] font-medium uppercase tracking-wide text-fg-faint">Équipes favorites</p>
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
        <option value="">Ajouter des équipes depuis un championnat…</option>
        {teamSources.map((c) => (
          <option key={c.code} value={c.code}>
            {c.name}
          </option>
        ))}
      </select>

      {loadingTeams && <p className="mt-2 text-xs text-fg-faint">Chargement…</p>}
      {!loadingTeams && pickComp !== '' && teams.length === 0 && (
        <p className="mt-2 text-xs text-fg-faint">Équipes indisponibles pour le moment.</p>
      )}
      {teams.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {teams.map((t) => {
            const logo = secureImageSrc(t.logo);
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => void toggleFavoriteTeam({ id: t.id, name: t.short || t.name })}
                className={cn(
                  'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                  favIds.has(t.id) ? 'bg-amber-400/15 text-amber-300' : 'bg-ink-700 text-fg-muted hover:text-fg',
                )}
              >
                {logo !== null && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logo} alt="" aria-hidden className="h-4 w-4 object-contain" />
                )}
                {t.short || t.name}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
