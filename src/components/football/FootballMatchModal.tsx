'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { StatusPill, TeamCrest } from '@/components/football/matchUi';
import { cn } from '@/lib/cn';
import { resolveWatchOptions, type MatchWatchOptions, type ResolvedBroadcast } from '@/services/football/footballService';
import { cleanChannelDisplay } from '@/services/live/channelNormalizer';
import {
  addSportReminder,
  getNotificationPermission,
  isReminderSet,
  notificationSupported,
  removeReminder,
  requestNotificationPermission,
  sportReminderId,
} from '@/services/notifications/reminderService';
import { useAuthStore } from '@/stores/authStore';
import type { FootballMatch } from '@/types/football';
import { liveHref } from '@/utils/appRoutes';
import { secureImageSrc } from '@/utils/secureUrl';
import { setZapContext } from '@/services/live/liveZappingService';

/**
 * Fiche d'un match : score/minute en direct (le parent passe la version a jour
 * du flux), et « OU REGARDER » :
 *  - chaines du guide TV FR (exactes) ou probables, resolues vers le bouquet ;
 *  - « Regarder » si la chaine est dans le bouquet, sinon « absente » ;
 *  - flux evenementiels du fournisseur nommes d'apres le match ;
 *  - rappel avant le coup d'envoi.
 */

function confidenceLabel(b: ResolvedBroadcast): { text: string; className: string } {
  if (b.confirmedBy === 'guide') return { text: 'Chaîne confirmée · guide TV', className: 'text-emerald-400' };
  if (b.confirmedBy === 'xtream') return { text: 'Confirmée par le guide de ton serveur', className: 'text-emerald-400' };
  return { text: 'Diffuseur probable (droits TV)', className: 'text-fg-faint' };
}

export function FootballMatchModal({ match, onClose }: { match: FootballMatch; onClose: () => void }) {
  const router = useRouter();
  const credentials = useAuthStore((s) => s.credentials);
  const [watch, setWatch] = useState<MatchWatchOptions | null>(null);
  const [reminded, setReminded] = useState(false);
  const [remindBusy, setRemindBusy] = useState(false);
  const live = match.state === 'live' || match.state === 'halftime';
  const showScore = live || match.state === 'finished';
  const upcoming = match.state === 'scheduled' && match.start > Date.now();
  const tvKey = match.tv.map((b) => `${b.channel}:${b.confidence}`).join('|');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  // Ou regarder : recalcule si les diffusions changent (guide arrive en cours de route).
  useEffect(() => {
    let alive = true;
    void resolveWatchOptions(match, credentials)
      .then((w) => alive && setWatch(w))
      .catch(() => alive && setWatch({ broadcasts: [], eventChannels: [] }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match.id, tvKey, credentials]);

  const playable = watch?.broadcasts.find((b) => b.channel !== null) ?? null;
  const primaryChannel = playable?.channel ?? watch?.eventChannels[0] ?? null;
  const reminderChannelId = primaryChannel?.id ?? null;

  useEffect(() => {
    if (!upcoming || watch === null) return;
    let alive = true;
    void isReminderSet(reminderChannelId, match.start).then((v) => alive && setReminded(v));
    return () => {
      alive = false;
    };
  }, [upcoming, watch, reminderChannelId, match.start]);

  const toggleReminder = async () => {
    if (remindBusy) return;
    setRemindBusy(true);
    try {
      if (reminded) {
        await removeReminder(sportReminderId(reminderChannelId, match.start));
        setReminded(false);
        return;
      }
      const perm = getNotificationPermission() === 'granted' ? 'granted' : await requestNotificationPermission();
      if (perm !== 'granted') return;
      await addSportReminder({
        channelId: reminderChannelId,
        channelName: primaryChannel?.name ?? match.tv[0]?.channel ?? match.competition.name,
        title: `${match.home.short} - ${match.away.short}`,
        start: match.start,
      });
      setReminded(true);
    } finally {
      setRemindBusy(false);
    }
  };

  const open = (id: string) => {
    onClose();
    // Pas de liste d'origine : le zapping suit la categorie de la chaine.
    setZapContext(null);
    router.push(liveHref(id));
  };

  const compLogo = secureImageSrc(match.competition.logo);
  const dateLabel = new Date(match.start).toLocaleString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${match.home.name} - ${match.away.name}`}
      onClick={onClose}
      className="fixed inset-0 z-50 flex animate-fade-in items-end justify-center overflow-y-auto overscroll-contain bg-black/70 backdrop-blur-sm sm:items-center sm:p-6"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'relative w-full max-w-lg animate-modal-rise rounded-t-3xl border border-ink-700/60 bg-gradient-to-b p-6 pb-[calc(2rem+env(safe-area-inset-bottom))] shadow-2xl shadow-black/60 sm:rounded-3xl sm:pb-8',
          live ? 'from-accent/20 via-ink-900 to-ink-950' : 'from-ink-800 via-ink-900 to-ink-950',
        )}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          className="absolute right-3 top-3 grid h-11 w-11 place-items-center rounded-full bg-black/40 text-white/80 transition-colors hover:bg-black/60 hover:text-white"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
          </svg>
        </button>

        <div className="flex items-center justify-center gap-2 pr-8 text-[11px] font-semibold uppercase tracking-wider text-fg-faint">
          {compLogo !== null && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={compLogo} alt="" aria-hidden className="h-4 w-4 object-contain" />
          )}
          <span className="truncate">
            {match.competition.name}
            {match.round !== null && ` · ${match.round}`}
          </span>
        </div>

        <div className="mt-5 flex items-center gap-3">
          <div className="flex min-w-0 flex-1 flex-col items-center gap-2 text-center">
            <TeamCrest side={match.home} className="h-14 w-14 sm:h-16 sm:w-16" />
            <span className="line-clamp-2 text-sm font-semibold text-fg">{match.home.name}</span>
          </div>
          <div className="flex shrink-0 flex-col items-center gap-1.5">
            {showScore ? (
              <span className="text-3xl font-black tabular-nums text-fg sm:text-4xl">
                {match.home.score ?? 0}
                <span className="mx-1 text-fg-faint">-</span>
                {match.away.score ?? 0}
              </span>
            ) : (
              <span className="text-lg font-bold text-fg-muted">VS</span>
            )}
            {match.home.shootout !== null && match.away.shootout !== null && (
              <span className="text-[11px] font-semibold text-fg-muted">
                TAB {match.home.shootout}-{match.away.shootout}
              </span>
            )}
            <span className={cn('rounded-full px-2.5 py-0.5', live ? 'bg-accent/20' : 'bg-ink-700')}>
              <StatusPill match={match} />
            </span>
          </div>
          <div className="flex min-w-0 flex-1 flex-col items-center gap-2 text-center">
            <TeamCrest side={match.away} className="h-14 w-14 sm:h-16 sm:w-16" />
            <span className="line-clamp-2 text-sm font-semibold text-fg">{match.away.name}</span>
          </div>
        </div>

        <p className="mt-4 text-center text-[11px] capitalize text-fg-faint">
          {dateLabel}
          {match.venue !== null && <span className="normal-case"> · {match.venue}</span>}
        </p>

        {/* Ou regarder */}
        <section className="mt-6">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-faint">Où regarder</h3>
          {watch === null ? (
            <div className="space-y-2">
              <div className="h-14 animate-pulse rounded-xl bg-ink-700/60" />
              <div className="h-14 animate-pulse rounded-xl bg-ink-700/40" />
            </div>
          ) : watch.broadcasts.length === 0 && watch.eventChannels.length === 0 ? (
            <div className="rounded-xl bg-ink-800 px-4 py-3 text-sm text-fg-muted">
              Aucune diffusion TV trouvée en France pour ce match.
              <button
                type="button"
                onClick={() => {
                  onClose();
                  router.push('/live');
                }}
                className="mt-2 block text-xs font-semibold text-accent hover:underline"
              >
                Chercher dans le Live
              </button>
            </div>
          ) : (
            <ul className="space-y-2">
              {watch.broadcasts.map((b) => {
                const label = confidenceLabel(b);
                const name = cleanChannelDisplay(b.broadcast.channel) || b.broadcast.channel;
                return (
                  <li
                    key={b.broadcast.channel}
                    className="flex items-center gap-3 rounded-xl border border-ink-700/60 bg-ink-800/80 px-3 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-fg">
                        {name}
                        {b.broadcast.kind === 'multiplex' && (
                          <span className="ml-1.5 rounded bg-ink-600 px-1.5 py-0.5 text-[10px] font-semibold text-fg-muted">
                            Multiplex
                          </span>
                        )}
                      </p>
                      <p className={cn('truncate text-[11px]', label.className)}>{label.text}</p>
                    </div>
                    {b.channel !== null ? (
                      <button
                        type="button"
                        onClick={() => open(b.channel!.id)}
                        className="flex shrink-0 items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white transition-transform hover:scale-[1.03] active:scale-95"
                      >
                        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
                          <path d="M8 5v14l11-7z" />
                        </svg>
                        Regarder
                      </button>
                    ) : (
                      <span className="shrink-0 text-right text-[10px] leading-tight text-fg-faint">
                        Absente de
                        <br />
                        ton bouquet
                      </span>
                    )}
                  </li>
                );
              })}
              {watch.eventChannels.map((c) => (
                <li key={c.id} className="flex items-center gap-3 rounded-xl border border-ink-700/60 bg-ink-800/80 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-fg">{c.name}</p>
                    <p className="truncate text-[11px] text-emerald-400">Flux dédié à ce match dans ton bouquet</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => open(c.id)}
                    className="flex shrink-0 items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white transition-transform hover:scale-[1.03] active:scale-95"
                  >
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
                      <path d="M8 5v14l11-7z" />
                    </svg>
                    Regarder
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {upcoming && notificationSupported() && (
          <button
            type="button"
            onClick={() => void toggleReminder()}
            disabled={remindBusy || watch === null}
            aria-pressed={reminded}
            className={cn(
              'mt-4 flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-50',
              reminded
                ? 'border-amber-400/40 bg-amber-400/15 text-amber-300'
                : 'border-ink-600 bg-ink-800 text-fg-muted hover:text-fg',
            )}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill={reminded ? 'currentColor' : 'none'} aria-hidden>
              <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9Z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M13.7 21a2 2 0 0 1-3.4 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            {reminded ? 'Rappel activé' : 'Me notifier avant le coup d’envoi'}
          </button>
        )}
        {upcoming && notificationSupported() && (
          <p className="mt-1.5 text-center text-xs text-fg-muted">
            Sur iPhone, le rappel n’arrive que si ZiBTV est ouverte (ou à sa réouverture).
          </p>
        )}
      </div>
    </div>
  );
}
