'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { FootballMatch } from '@/app/api/football/route';
import { cn } from '@/lib/cn';
import {
  isFinishedStatus,
  isLiveStatus,
  resolveBroadcastChannels,
  type BroadcastChannel,
} from '@/services/football/footballService';
import {
  addSportReminder,
  getNotificationPermission,
  isReminderSet,
  notificationSupported,
  removeReminder,
  requestNotificationPermission,
  sportReminderId,
} from '@/services/notifications/reminderService';
import { displayChannelName } from '@/utils/displayTitle';

/**
 * Carte DETAIL d'un match (premium) : score, mi-temps, phase, stade, arbitre +
 * « Voir le match » click-to-play (ouvre la chaine FR du bouquet Live, mapping
 * diffuseurs par competition). Si aucune chaine trouvee : chips de secours / rien.
 */

const STAGE_LABEL: Record<string, string> = {
  LEAGUE_STAGE: 'Phase de ligue',
  GROUP_STAGE: 'Phase de groupes',
  LAST_32: '16es de finale',
  LAST_16: '8es de finale',
  QUARTER_FINALS: 'Quarts de finale',
  SEMI_FINALS: 'Demi-finales',
  THIRD_PLACE: 'Match pour la 3e place',
  FINAL: 'Finale',
};

function headline(m: FootballMatch): string {
  if (isLiveStatus(m.status)) return m.minute !== null ? `${m.minute}'` : 'En direct';
  if (isFinishedStatus(m.status)) return 'Terminé';
  return new Date(m.start).toLocaleString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' });
}

function Side({ crest, name }: { crest: string | null; name: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-2 text-center">
      {crest !== null ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={crest} alt="" aria-hidden className="h-14 w-14 object-contain drop-shadow sm:h-16 sm:w-16" />
      ) : (
        <span className="h-14 w-14 rounded-full bg-ink-700 sm:h-16 sm:w-16" />
      )}
      <span className="line-clamp-2 text-sm font-semibold text-fg">{name}</span>
    </div>
  );
}

export function FootballMatchModal({ match, onClose }: { match: FootballMatch; onClose: () => void }) {
  const router = useRouter();
  const [channels, setChannels] = useState<BroadcastChannel[] | null>(null);
  const [reminded, setReminded] = useState(false);
  const [remindBusy, setRemindBusy] = useState(false);
  const live = isLiveStatus(match.status);
  const showScore = live || isFinishedStatus(match.status);
  const upcoming = !live && !isFinishedStatus(match.status) && match.start > Date.now();
  const matchTitle = `${match.home.short} - ${match.away.short}`;

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

  useEffect(() => {
    let active = true;
    void resolveBroadcastChannels(match.competitionCode).then((c) => {
      if (active) setChannels(c);
    });
    return () => {
      active = false;
    };
  }, [match.competitionCode]);

  // Rappel notif (matchs a venir) : cle stable basee sur la 1re chaine resolue
  // (ou null) + le coup d'envoi. Verifie l'etat une fois les chaines chargees.
  const reminderChannelId = channels !== null && channels.length > 0 ? channels[0]!.id : null;
  useEffect(() => {
    if (!upcoming || channels === null) return;
    let active = true;
    void isReminderSet(reminderChannelId, match.start).then((v) => {
      if (active) setReminded(v);
    });
    return () => {
      active = false;
    };
  }, [upcoming, channels, reminderChannelId, match.start]);

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
        channelName: channels !== null && channels.length > 0 ? channels[0]!.name : match.competition,
        title: matchTitle,
        start: match.start,
      });
      setReminded(true);
    } finally {
      setRemindBusy(false);
    }
  };

  const openChannel = (id: string) => {
    onClose();
    router.push(`/live/${id}`);
  };

  const meta = [
    match.stage !== null ? (STAGE_LABEL[match.stage] ?? null) : null,
    match.matchday !== null ? `Journée ${match.matchday}` : null,
    match.venue,
  ].filter((v): v is string => v !== null && v !== '');

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-50 flex animate-fade-in items-end justify-center overflow-y-auto overscroll-contain bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-6"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'relative w-full max-w-lg animate-modal-rise overflow-hidden rounded-t-3xl border border-ink-700/60 bg-gradient-to-b p-6 pb-8 shadow-2xl shadow-black/60 sm:rounded-3xl',
          live ? 'from-accent/20 via-ink-900 to-ink-950' : 'from-ink-800 via-ink-900 to-ink-950',
        )}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          className="absolute right-3 top-3 rounded-full bg-black/40 p-2 text-white/80 transition-colors hover:bg-black/60 hover:text-white"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
          </svg>
        </button>

        <p className="text-center text-[11px] font-semibold uppercase tracking-wider text-fg-faint">
          {match.competition}
          {meta.length > 0 && <span className="text-fg-faint"> · {meta.join(' · ')}</span>}
        </p>

        <div className="mt-5 flex items-center gap-3">
          <Side crest={match.home.crest} name={match.home.name || match.home.short} />
          <div className="flex shrink-0 flex-col items-center gap-1">
            {showScore ? (
              <span className="text-3xl font-black tabular-nums text-fg sm:text-4xl">
                {match.home.goals ?? 0}<span className="mx-1 text-fg-faint">-</span>{match.away.goals ?? 0}
              </span>
            ) : (
              <span className="text-lg font-bold text-fg-muted">VS</span>
            )}
            <span
              className={cn(
                'flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold',
                live ? 'bg-accent text-white' : 'bg-ink-700 text-fg-muted',
              )}
            >
              {live && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />}
              {headline(match)}
            </span>
            {match.halfTime !== null && (
              <span className="text-[10px] text-fg-faint">
                Mi-temps {match.halfTime.home ?? 0}-{match.halfTime.away ?? 0}
              </span>
            )}
          </div>
          <Side crest={match.away.crest} name={match.away.name || match.away.short} />
        </div>

        {match.referee !== null && (
          <p className="mt-4 text-center text-[11px] text-fg-faint">Arbitre · {match.referee}</p>
        )}

        {upcoming && notificationSupported() && (
          <button
            type="button"
            onClick={() => void toggleReminder()}
            disabled={remindBusy}
            aria-pressed={reminded}
            className={cn(
              'mt-5 flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-50',
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

        <div className="mt-4">
          {channels === null ? (
            <div className="h-11 animate-pulse rounded-xl bg-ink-700/60" />
          ) : channels.length > 0 ? (
            <>
              <button
                type="button"
                onClick={() => openChannel(channels[0]!.id)}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-white transition-transform hover:scale-[1.02] active:scale-95"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
                  <path d="M8 5v14l11-7z" />
                </svg>
                Voir le match · {displayChannelName(channels[0]!.name)}
              </button>
              {channels.length > 1 && (
                <div className="mt-2 flex flex-wrap justify-center gap-1.5">
                  {channels.slice(1, 6).map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => openChannel(c.id)}
                      className="rounded-full bg-ink-700 px-3 py-1.5 text-xs font-medium text-fg-muted transition-colors hover:bg-ink-600 hover:text-fg"
                    >
                      {displayChannelName(c.name)}
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <button
              type="button"
              onClick={() => {
                onClose();
                router.push('/live');
              }}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-ink-700 px-4 py-3 text-sm font-medium text-fg-muted transition-colors hover:bg-ink-600 hover:text-fg"
            >
              Chaîne introuvable · ouvrir le Live
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
