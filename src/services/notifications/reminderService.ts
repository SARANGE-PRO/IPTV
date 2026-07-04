import * as reminderRepository from '@/db/repositories/reminderRepository';
import type { Reminder } from '@/types/models';

/**
 * Rappels d'evenements (sport). Notifie AU PREMIER PLAN (pendant que la PWA est
 * ouverte) + RATTRAPAGE a l'ouverture. iOS n'offre ni Notification Triggers ni
 * periodic background sync : un reveil app FERMEE exigerait un serveur Web Push
 * (VAPID + store d'abonnements + cron) — non implemente ici (le SW porte deja
 * les handlers `push`/`notificationclick` pour brancher ce serveur plus tard).
 *
 * 100% metadonnees : un rappel ne contient qu'un titre, un nom de chaine et un
 * horodatage — jamais d'URL de flux ni d'identifiant.
 */

const DEFAULT_LEAD_MINUTES = 10;
export const REMINDERS_CHANGED_EVENT = 'zib:reminders-changed';

export type NotificationPermissionState = 'default' | 'granted' | 'denied' | 'unsupported';

export function notificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getNotificationPermission(): NotificationPermissionState {
  if (!notificationSupported()) return 'unsupported';
  return Notification.permission as NotificationPermissionState;
}

/** Demande la permission (DOIT etre appelee depuis un geste utilisateur). */
export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (!notificationSupported()) return 'unsupported';
  try {
    return (await Notification.requestPermission()) as NotificationPermissionState;
  } catch {
    return getNotificationPermission();
  }
}

function emitChanged(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(REMINDERS_CHANGED_EVENT));
}

export function sportReminderId(channelId: string | null, startAt: number): string {
  return `sport:${channelId ?? 'na'}:${startAt}`;
}

export interface SportReminderInput {
  channelId: string | null;
  channelName: string | null;
  title: string;
  start: number;
}

/** Cree/maj un rappel pour un evenement sport. Idempotent (cle stable). */
export async function addSportReminder(
  input: SportReminderInput,
  leadMinutes: number = DEFAULT_LEAD_MINUTES,
): Promise<Reminder> {
  const reminder: Reminder = {
    id: sportReminderId(input.channelId, input.start),
    kind: 'sport',
    title: input.title,
    channelId: input.channelId,
    channelName: input.channelName,
    startAt: input.start,
    leadMinutes,
    notifiedAt: null,
    createdAt: Date.now(),
  };
  await reminderRepository.putReminder(reminder);
  emitChanged();
  return reminder;
}

export async function removeReminder(id: string): Promise<void> {
  await reminderRepository.deleteReminder(id);
  emitChanged();
}

export function listReminders(): Promise<Reminder[]> {
  return reminderRepository.getAllReminders();
}

export async function isReminderSet(channelId: string | null, startAt: number): Promise<boolean> {
  return (await reminderRepository.getReminder(sportReminderId(channelId, startAt))) !== undefined;
}

/** Instant de declenchement (avance `leadMinutes` avant le debut). */
export function fireAtOf(reminder: Reminder): number {
  return reminder.startAt - reminder.leadMinutes * 60_000;
}

const KIND_ICON: Record<Reminder['kind'], string> = { sport: '⚽' };

/** Affiche la notification via le service worker (fallback Notification directe). */
export async function showReminderNotification(reminder: Reminder): Promise<void> {
  if (getNotificationPermission() !== 'granted') return;
  const soon = reminder.startAt - Date.now();
  const whenLabel =
    soon <= 0 ? "c'est parti" : soon < 60_000 ? 'ça commence' : `dans ${Math.round(soon / 60_000)} min`;
  const title = `${KIND_ICON[reminder.kind]} ${reminder.title}`;
  const body = reminder.channelName !== null ? `${whenLabel} · ${reminder.channelName}` : whenLabel;
  const options: NotificationOptions & { data?: unknown } = {
    body,
    tag: reminder.id,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: reminder.channelId !== null ? `/live/${reminder.channelId}` : '/' },
  };
  try {
    const reg =
      typeof navigator !== 'undefined' && 'serviceWorker' in navigator
        ? await navigator.serviceWorker.getRegistration()
        : undefined;
    if (reg !== undefined) {
      await reg.showNotification(title, options);
      return;
    }
  } catch {
    // pas de SW : on tente la notification directe (desktop)
  }
  try {
    new Notification(title, options);
  } catch {
    // iOS exige le SW : sans registration, on ne peut rien afficher
  }
}
