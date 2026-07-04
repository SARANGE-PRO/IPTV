import { db } from '@/db/database';
import type { Reminder } from '@/types/models';

/** Acces Dexie aux rappels. Aucune logique metier ici (voir reminderService). */

export function putReminder(reminder: Reminder): Promise<string> {
  return db.reminders.put(reminder);
}

export function deleteReminder(id: string): Promise<void> {
  return db.reminders.delete(id);
}

export function getReminder(id: string): Promise<Reminder | undefined> {
  return db.reminders.get(id);
}

/** Tous les rappels tries par debut croissant. */
export function getAllReminders(): Promise<Reminder[]> {
  return db.reminders.orderBy('startAt').toArray();
}

/** Rappels dont l'evenement n'est pas encore termine (startAt > cutoff). */
export function getUpcomingReminders(cutoff: number): Promise<Reminder[]> {
  return db.reminders.where('startAt').above(cutoff).toArray();
}

export function markReminderNotified(id: string, at: number): Promise<number> {
  return db.reminders.update(id, { notifiedAt: at });
}

/** Purge les rappels dont l'evenement est termine depuis un moment. */
export async function purgeStaleReminders(before: number): Promise<void> {
  await db.reminders.where('startAt').below(before).delete();
}
