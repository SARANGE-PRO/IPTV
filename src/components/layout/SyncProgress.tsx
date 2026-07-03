'use client';

import { cn } from '@/lib/cn';
import { useCatalogStore, type SyncSectionState } from '@/stores/catalogStore';
import type { Section } from '@/types/models';
import { formatCount } from '@/utils/format';

/**
 * Banniere globale de progression de la synchronisation. Visible pendant toute
 * la sync (souvent longue au premier lancement) pour que l'utilisateur comprenne
 * ce qui se passe. Sections synchronisees sequentiellement : Live -> Films -> Series.
 */

const ORDER: Section[] = ['live', 'vod', 'series'];
const LABELS: Record<Section, string> = { live: 'Live', vod: 'Films', series: 'Séries' };

function stateLabel(state: SyncSectionState, count: number): string {
  if (state === 'loading') return 'en cours…';
  if (state === 'done') return `${formatCount(count)} récupérés`;
  if (state === 'skipped') return 'déjà à jour';
  if (state === 'error') return 'erreur';
  return 'en attente';
}

function StateDot({ state }: { state: SyncSectionState }) {
  if (state === 'loading') {
    return <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-ink-500 border-t-accent" />;
  }
  const color =
    state === 'done'
      ? 'bg-emerald-400'
      : state === 'skipped'
        ? 'bg-fg-faint'
        : state === 'error'
          ? 'bg-accent'
          : 'bg-ink-600';
  return <span className={cn('h-3.5 w-3.5 shrink-0 rounded-full', color)} />;
}

export function SyncProgress() {
  const syncing = useCatalogStore((s) => s.syncing);
  const progress = useCatalogStore((s) => s.syncProgress);
  const counts = useCatalogStore((s) => s.syncCounts);

  if (!syncing) return null;
  const settled = ORDER.filter((s) => progress[s] !== 'pending' && progress[s] !== 'loading').length;

  return (
    <div className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-50 px-4 md:bottom-4 md:pl-60">
      <div className="mx-auto max-w-md rounded-2xl border border-ink-700 bg-ink-900/95 p-4 shadow-xl backdrop-blur">
        <div className="flex items-center gap-2.5">
          <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-ink-500 border-t-accent" />
          <p className="text-sm font-medium text-fg">Synchronisation du catalogue…</p>
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-fg-faint">
          La première synchronisation peut être longue (gros catalogue). Tu peux continuer à naviguer.
        </p>
        <div className="mt-3 flex flex-col gap-1.5">
          {ORDER.map((section) => (
            <div key={section} className="flex items-center gap-2.5 text-xs">
              <StateDot state={progress[section]} />
              <span className="w-12 font-medium text-fg-muted">{LABELS[section]}</span>
              <span className="text-fg-faint">{stateLabel(progress[section], counts[section])}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-ink-700">
          <div className="h-full bg-accent transition-all duration-500" style={{ width: `${(settled / ORDER.length) * 100}%` }} />
        </div>
      </div>
    </div>
  );
}
