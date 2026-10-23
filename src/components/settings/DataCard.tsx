'use client';

import { useEffect, useState } from 'react';
import { SettingsCard, SettingsRow, StatusLine } from '@/components/settings/SettingsCard';
import { Button } from '@/components/ui/Button';
import { IconTrash } from '@/components/ui/icons';
import { isStoragePersisted, requestPersistentStorage } from '@/lib/persistStorage';
import { usePlaybackStore } from '@/stores/playbackStore';

const MB = 1024 * 1024;

/** Stockage local (occupation, persistance iOS) et historique de lecture. */
export function DataCard() {
  const clearHistory = usePlaybackStore((s) => s.clearHistory);
  const [usage, setUsage] = useState<{ used: number; quota: number } | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (navigator.storage?.estimate !== undefined) {
      void navigator.storage
        .estimate()
        .then(({ usage: used, quota }) => {
          if (used !== undefined && quota !== undefined && quota > 0) setUsage({ used, quota });
        })
        .catch(() => undefined);
    }
    void isStoragePersisted().then(setPersisted);
  }, []);

  const handlePersist = async () => {
    const ok = await requestPersistentStorage();
    setPersisted(ok);
    setMessage(ok ? 'Stockage protégé.' : 'Refusé par le navigateur (iOS l’accorde souvent après un usage régulier).');
  };

  const handleClearHistory = async () => {
    if (!window.confirm('Effacer les reprises de lecture, la progression et les chaînes récentes ?')) return;
    await clearHistory();
    setMessage('Historique effacé.');
  };

  const ratio = usage !== null ? Math.min(1, usage.used / usage.quota) : 0;

  return (
    <SettingsCard title="Stockage et historique">
      <div className="flex flex-col gap-5">
        <div>
          <div className="flex items-baseline justify-between text-xs">
            <span className="text-fg">Espace utilisé</span>
            <span className="tabular-nums text-fg-muted">
              {usage !== null ? `${(usage.used / MB).toFixed(0)} Mo / ${(usage.quota / MB).toFixed(0)} Mo` : '—'}
            </span>
          </div>
          <span className="relative mt-1.5 block h-1.5 overflow-hidden rounded-full bg-ink-700">
            <span className="absolute inset-y-0 left-0 rounded-full bg-accent/80" style={{ width: `${Math.max(2, ratio * 100)}%` }} />
          </span>
        </div>

        {persisted !== null && (
          <SettingsRow
            label="Protection contre la purge"
            hint={
              persisted
                ? 'Activée : iOS ne videra pas le catalogue.'
                : 'iOS peut vider le stockage d’une app peu utilisée (une resynchro le reconstruit).'
            }
          >
            {persisted ? (
              <span className="shrink-0 text-xs font-medium text-emerald-400">Activée</span>
            ) : (
              <Button variant="secondary" size="sm" onClick={() => void handlePersist()}>
                Activer
              </Button>
            )}
          </SettingsRow>
        )}

        <SettingsRow label="Historique de lecture" hint="Reprises, progression et chaînes récentes.">
          <Button variant="secondary" size="sm" onClick={() => void handleClearHistory()}>
            <IconTrash className="h-4 w-4" />
            Effacer
          </Button>
        </SettingsRow>
      </div>
      {message !== null && <StatusLine>{message}</StatusLine>}
    </SettingsCard>
  );
}
