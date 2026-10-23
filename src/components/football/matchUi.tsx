import { cn } from '@/lib/cn';
import type { ChannelRef } from '@/services/football/channelIndex';
import { cleanChannelDisplay } from '@/services/live/channelNormalizer';
import type { FootballMatch, MatchSide } from '@/types/football';
import { secureImageSrc } from '@/utils/secureUrl';

/** Briques visuelles foot partagees (header d'accueil, page Football, fiche match). */

export function kickoffTime(ms: number): string {
  return new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

/** « 21:00 », « dim. 21:00 » hors aujourd'hui. */
export function kickoffLabel(ms: number): string {
  const d = new Date(ms);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return kickoffTime(ms);
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  if (d.toDateString() === tomorrow.toDateString()) return `Demain ${kickoffTime(ms)}`;
  return `${d.toLocaleDateString('fr-FR', { weekday: 'short' })} ${kickoffTime(ms)}`;
}

export function TeamCrest({ side, className }: { side: MatchSide; className?: string }) {
  const src = secureImageSrc(side.logo);
  if (src === null) {
    return (
      <span
        aria-hidden
        className={cn('grid shrink-0 place-items-center rounded-full bg-ink-600 text-[9px] font-bold text-fg-muted', className)}
      >
        {(side.abbr || side.short).slice(0, 3).toUpperCase()}
      </span>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" aria-hidden loading="lazy" className={cn('shrink-0 object-contain', className)} />;
}

/** Pastille d'etat : minute en direct (rouge), MT, Terminé, heure de coup d'envoi. */
export function StatusPill({ match, compact = false }: { match: FootballMatch; compact?: boolean }) {
  if (match.state === 'live' || match.state === 'halftime') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-accent">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
        {match.clock ?? 'Direct'}
      </span>
    );
  }
  if (match.state === 'finished') return <span className="text-[11px] font-medium text-fg-faint">{match.clock ?? 'Terminé'}</span>;
  if (match.state === 'postponed' || match.state === 'canceled') {
    return <span className="text-[11px] font-medium text-amber-300">{match.clock}</span>;
  }
  return (
    <span className="text-[11px] font-semibold tabular-nums text-fg-muted">
      {compact ? kickoffTime(match.start) : kickoffLabel(match.start)}
    </span>
  );
}

/**
 * Ligne « ou regarder » compacte : 1re diffusion, coche verte si chaine exacte
 * (guide TV), point si presente dans le bouquet, « probable » sinon.
 */
export function TvLine({
  match,
  bouquet,
  className,
}: {
  match: FootballMatch;
  bouquet: Map<string, ChannelRef | null>;
  className?: string;
}) {
  const first = match.tv.find((b) => bouquet.get(b.channel) != null) ?? match.tv[0];
  if (first === undefined) {
    if (match.state === 'finished') return null;
    return <p className={cn('truncate text-[10px] text-fg-faint', className)}>Pas de diffusion TV trouvée en France</p>;
  }
  const inBouquet = bouquet.get(first.channel) != null;
  const extra = match.tv.length - 1;
  return (
    <p className={cn('flex min-w-0 items-center gap-1 text-[10px]', className)}>
      <svg viewBox="0 0 24 24" className="h-3 w-3 shrink-0 text-fg-faint" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <rect x="3" y="6" width="18" height="12" rx="2" />
        <path d="m8 2 4 4 4-4" />
      </svg>
      <span className={cn('min-w-0 truncate font-semibold', inBouquet ? 'text-fg' : 'text-fg-muted')}>
        {cleanChannelDisplay(first.channel) || first.channel}
      </span>
      {first.confidence === 'confirmed' ? (
        <span className="shrink-0 font-bold text-emerald-400" title="Chaîne confirmée par le guide TV">✓</span>
      ) : (
        <span className="shrink-0 text-fg-faint">· probable</span>
      )}
      {first.kind === 'multiplex' && <span className="shrink-0 text-fg-faint">· multiplex</span>}
      {extra > 0 && <span className="shrink-0 text-fg-faint">+{extra}</span>}
    </p>
  );
}
