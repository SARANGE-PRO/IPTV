'use client';

import { useEffect, useState } from 'react';
import type { SportEvent } from '@/services/live/sportEventsService';
import {
  addSportReminder,
  getNotificationPermission,
  isReminderSet,
  notificationSupported,
  removeReminder,
  requestNotificationPermission,
  sportReminderId,
} from '@/services/notifications/reminderService';

/**
 * Bouton "Me rappeler" d'un evenement sport. Demande la permission notification
 * au 1er clic (geste utilisateur requis), cree/supprime le rappel. Style adapte
 * au billboard SportHero (fond sombre). Masque si notifications non supportees
 * ou evenement deja commence.
 */
export function ReminderButton({ event }: { event: SportEvent }) {
  const [isSet, setIsSet] = useState(false);
  const [busy, setBusy] = useState(false);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    let active = true;
    void isReminderSet(event.channelId, event.start).then((v) => {
      if (active) setIsSet(v);
    });
    return () => {
      active = false;
    };
  }, [event.channelId, event.start]);

  if (!notificationSupported() || event.start <= Date.now()) return null;

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (isSet) {
        await removeReminder(sportReminderId(event.channelId, event.start));
        setIsSet(false);
        return;
      }
      const permission =
        getNotificationPermission() === 'granted' ? 'granted' : await requestNotificationPermission();
      if (permission !== 'granted') {
        setDenied(permission === 'denied');
        return;
      }
      await addSportReminder({
        channelId: event.channelId,
        channelName: event.channelName,
        title: event.title,
        start: event.start,
      });
      setIsSet(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      disabled={busy || denied}
      aria-pressed={isSet}
      title={denied ? 'Notifications refusées dans les réglages du navigateur' : undefined}
      className="inline-flex items-center gap-1.5 rounded-xl bg-black/40 px-3.5 py-2.5 text-sm font-semibold text-white/90 backdrop-blur transition-colors hover:bg-black/60 disabled:opacity-50"
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill={isSet ? 'currentColor' : 'none'} aria-hidden>
        <path
          d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9Z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M13.7 21a2 2 0 0 1-3.4 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      {denied ? 'Notifs bloquées' : isSet ? 'Rappel activé' : 'Me rappeler'}
    </button>
  );
}
