'use client';

import { useCallback, useEffect, useState } from 'react';
import { SettingsCard } from '@/components/settings/SettingsCard';
import * as hiddenCategoriesRepository from '@/services/data/hiddenCategoriesDataService';
import { useFilterStore } from '@/stores/filterStore';
import type { HiddenCategoryEntry, Section } from '@/types/models';

const SECTION_LABELS: Record<Section, string> = { live: 'Live', vod: 'Films', series: 'Séries' };

export function HiddenCategoriesCard() {
  const unhideCategory = useFilterStore((s) => s.unhideCategory);
  const [list, setList] = useState<HiddenCategoryEntry[] | null>(null);

  const refresh = useCallback(async () => {
    setList(await hiddenCategoriesRepository.getAllHiddenCategories());
  }, []);

  useEffect(() => {
    void refresh().catch(() => setList([]));
  }, [refresh]);

  const handleUnhide = async (entry: HiddenCategoryEntry) => {
    await unhideCategory(entry.section, entry.categoryId);
    await refresh();
  };

  const count = list?.length ?? 0;

  return (
    <SettingsCard title={count > 0 ? `Catégories masquées (${count})` : 'Catégories masquées'}>
      {list === null ? (
        <p className="text-xs text-fg-faint">Chargement…</p>
      ) : count === 0 ? (
        <p className="text-xs text-fg-muted">Aucune. Masque une catégorie depuis l’icône œil barré ou le menu « ⋯ » d’une chaîne.</p>
      ) : (
        <div className="-mx-2 flex flex-col">
          {list.map((entry) => (
            <div key={`${entry.section}:${entry.categoryId}`} className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-ink-700">
              <span className="rounded bg-ink-600 px-1.5 py-0.5 text-[10px] uppercase text-fg-faint">
                {SECTION_LABELS[entry.section]}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-fg">{entry.label}</span>
              <button
                type="button"
                onClick={() => void handleUnhide(entry)}
                className="shrink-0 px-1 py-1 text-xs font-medium text-accent hover:underline"
              >
                Réafficher
              </button>
            </div>
          ))}
        </div>
      )}
    </SettingsCard>
  );
}
