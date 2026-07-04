'use client';

import { useEffect } from 'react';
import * as reminderRepository from '@/db/repositories/reminderRepository';
import {
  fireAtOf,
  getNotificationPermission,
  REMINDERS_CHANGED_EVENT,
  showReminderNotification,
} from '@/services/notifications/reminderService';

/**
 * Planificateur de rappels AU PREMIER PLAN : tant que la PWA est ouverte, arme
 * un timer par rappel en attente et notifie a l'avance (leadMinutes). A
 * l'ouverture, RATTRAPE les rappels deja dus non notifies (fenetre de grace).
 * Reveil app FERMEE = hors de portee sans serveur push (voir reminderService).
 */

const START_GRACE_MS = 5 * 60_000; // notifie encore jusqu'a 5 min apres le debut
const STALE_MS = 6 * 60 * 60_000; // purge des rappels termines depuis 6 h
const MAX_TIMEOUT_MS = 2_147_483_647; // plafond setTimeout (~24,8 j)

export function useReminderScheduler(): void {
  useEffect(() => {
    let cancelled = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();

    const clearTimers = () => {
      for (const t of timers) clearTimeout(t);
      timers.clear();
    };

    const fire = async (id: string) => {
      if (getNotificationPermission() !== 'granted') return;
      const reminder = await reminderRepository.getReminder(id);
      if (reminder === undefined || reminder.notifiedAt !== null) return;
      await showReminderNotification(reminder);
      await reminderRepository.markReminderNotified(id, Date.now());
    };

    const reconcile = async () => {
      clearTimers();
      const now = Date.now();
      await reminderRepository.purgeStaleReminders(now - STALE_MS);
      if (cancelled) return;
      const reminders = await reminderRepository.getAllReminders();
      if (cancelled) return;
      for (const r of reminders) {
        if (r.notifiedAt !== null) continue;
        if (now > r.startAt + START_GRACE_MS) continue; // trop tard, la purge s'en chargera
        const fireAt = fireAtOf(r);
        if (fireAt <= now) {
          void fire(r.id); // rattrapage immediat
        } else {
          const delay = Math.min(fireAt - now, MAX_TIMEOUT_MS);
          const timer = setTimeout(() => void fire(r.id), delay);
          timers.add(timer);
        }
      }
    };

    void reconcile();
    const onChanged = () => void reconcile();
    window.addEventListener(REMINDERS_CHANGED_EVENT, onChanged);
    // Rattrapage quand la PWA revient au premier plan (timers geles en arriere-plan iOS).
    const onVisible = () => {
      if (document.visibilityState === 'visible') void reconcile();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      clearTimers();
      window.removeEventListener(REMINDERS_CHANGED_EVENT, onChanged);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
}
