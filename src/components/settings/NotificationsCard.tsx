'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import type { Reminder } from '@/types/models';
import {
  getNotificationPermission,
  listReminders,
  type NotificationPermissionState,
  REMINDERS_CHANGED_EVENT,
  removeReminder,
  requestNotificationPermission,
} from '@/services/notifications/reminderService';

/**
 * Reglage Notifications & rappels : etat de la permission + activation (geste
 * utilisateur) + liste des rappels programmes (suppression). Transparent sur la
 * limite : sans serveur push, les rappels ne se declenchent qu'app ouverte
 * (ou a sa reouverture).
 */

function formatWhen(ms: number): string {
  return new Date(ms).toLocaleString('fr-FR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const PERMISSION_LABEL: Record<NotificationPermissionState, string> = {
  granted: 'activées',
  denied: 'refusées',
  default: 'non activées',
  unsupported: 'non supportées par ce navigateur',
};

export function NotificationsCard() {
  const [permission, setPermission] = useState<NotificationPermissionState>('default');
  const [reminders, setReminders] = useState<Reminder[]>([]);

  const refresh = useCallback(async () => {
    setPermission(getNotificationPermission());
    setReminders(await listReminders());
  }, []);

  useEffect(() => {
    void refresh();
    const onChanged = () => void refresh();
    window.addEventListener(REMINDERS_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(REMINDERS_CHANGED_EVENT, onChanged);
  }, [refresh]);

  const enable = async () => {
    await requestNotificationPermission();
    await refresh();
  };

  const upcoming = reminders.filter((r) => r.startAt > Date.now());

  return (
    <section className="rounded-2xl bg-ink-800 p-5">
      <h2 className="mb-1 text-sm font-semibold text-fg">Notifications &amp; rappels</h2>
      <p className="text-xs leading-relaxed text-fg-muted">
        Programme un rappel avant un match depuis l’accueil (bouton « Me rappeler »). La notification
        arrive quelques minutes avant le coup d’envoi.
      </p>
      <p className="mt-2 text-[11px] leading-relaxed text-fg-faint">
        Sur iPhone, les rappels se déclenchent quand l’app est ouverte (ou à sa réouverture). Un rappel
        garanti app fermée nécessiterait un serveur d’envoi — pas encore activé.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <span className="text-xs text-fg-muted">
          Notifications :{' '}
          <span
            className={
              permission === 'granted'
                ? 'font-medium text-emerald-400'
                : permission === 'denied'
                  ? 'font-medium text-amber-400'
                  : 'font-medium text-fg'
            }
          >
            {PERMISSION_LABEL[permission]}
          </span>
        </span>
        {permission === 'default' && (
          <Button variant="secondary" onClick={() => void enable()}>
            Activer les notifications
          </Button>
        )}
      </div>

      {upcoming.length > 0 && (
        <div className="mt-4 flex flex-col gap-1">
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-fg-faint">
            Rappels programmés ({upcoming.length})
          </p>
          {upcoming.map((r) => (
            <div key={r.id} className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-ink-700">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-fg">{r.title}</span>
                <span className="block truncate text-[11px] text-fg-faint">
                  {formatWhen(r.startAt)}
                  {r.channelName !== null ? ` · ${r.channelName}` : ''}
                </span>
              </span>
              <button
                onClick={() => void removeReminder(r.id)}
                className="shrink-0 text-xs font-medium text-accent hover:underline"
              >
                Retirer
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
