'use client';

import { useEffect } from 'react';
import { SettingsCard } from '@/components/settings/SettingsCard';
import { Button } from '@/components/ui/Button';
import { IconRefresh } from '@/components/ui/icons';
import { useAuthStore } from '@/stores/authStore';
import { useCatalogStore } from '@/stores/catalogStore';
import type { Section } from '@/types/models';
import { formatCount, formatSince } from '@/utils/format';

const SECTION_LABELS: Record<Section, string> = { live: 'Chaînes', vod: 'Films', series: 'Séries' };
const SECTIONS: Section[] = ['live', 'vod', 'series'];

export function CatalogCard() {
  const credentials = useAuthStore((s) => s.credentials);
  const sections = useCatalogStore((s) => s.sections);
  const syncing = useCatalogStore((s) => s.syncing);
  const sync = useCatalogStore((s) => s.sync);
  const backfill = useCatalogStore((s) => s.backfill);
  const startBackfill = useCatalogStore((s) => s.startBackfill);
  const refreshBackfillCounts = useCatalogStore((s) => s.refreshBackfillCounts);

  useEffect(() => {
    void refreshBackfillCounts();
  }, [refreshBackfillCounts, sections.vod.itemCount, sections.series.itemCount]);

  const syncTimes = SECTIONS.map((s) => sections[s].lastFetchAt).filter((t): t is number => t !== null);
  const lastSync = syncTimes.length > 0 ? Math.max(...syncTimes) : null;
  const left = backfill.moviesLeft !== null && backfill.seriesLeft !== null ? backfill.moviesLeft + backfill.seriesLeft : null;

  return (
    <SettingsCard title="Catalogue">
      <div className="grid grid-cols-3 gap-2">
        {SECTIONS.map((s) => (
          <div key={s} className="rounded-xl bg-ink-900/60 px-3 py-2.5">
            <p className="text-base font-semibold tabular-nums text-fg">{formatCount(sections[s].itemCount)}</p>
            <p className="text-[11px] text-fg-faint">{SECTION_LABELS[s]}</p>
          </div>
        ))}
      </div>

      <p className="mt-3 text-xs text-fg-muted">
        {syncing ? 'Synchronisation en cours…' : lastSync !== null ? `Synchronisé ${formatSince(lastSync)}` : 'Jamais synchronisé'}
      </p>
      {left !== null && left > 0 && (
        <p className="mt-1 text-[11px] text-fg-faint">
          Fiches TMDB : {formatCount(left)} à compléter
          {backfill.running ? ' · en cours' : ' · en pause'}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            if (credentials !== null) void sync(credentials, { force: true });
          }}
          disabled={syncing || credentials === null}
        >
          <IconRefresh className="h-4 w-4" />
          {syncing ? 'Synchronisation…' : 'Resynchroniser'}
        </Button>
        {!backfill.running && left !== null && left > 0 && (
          <Button variant="ghost" size="sm" onClick={() => void startBackfill()}>
            Reprendre les fiches TMDB
          </Button>
        )}
      </div>
    </SettingsCard>
  );
}
