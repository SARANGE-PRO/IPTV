import { useEffect, useState } from 'react';
import { loadTrending } from '@/services/discovery/trendingService';
import { loadBillboard, type BillboardItem } from '@/services/home/homeRailsService';
import { useCatalogStore } from '@/stores/catalogStore';
import { useUiSettingsStore } from '@/stores/uiSettingsStore';
import type { VodSection } from '@/stores/vodFilterStore';

/** Dernier bandeau calcule par onglet (session) : affiche aussitot au retour. */
const lastBySection = new Map<VodSection, BillboardItem[]>();

/**
 * Bandeau « A la une » des onglets Films / Series : meme selection que
 * l'accueil (tendances TMDB presentes au catalogue, sinon Top 10 local), mais
 * d'un seul type. `pending` : la page reserve sa place (aucun saut).
 */
export function useSectionBillboard(section: VodSection): { items: BillboardItem[]; pending: boolean } {
  const sections = useCatalogStore((s) => s.sections);
  const preferredLanguage = useUiSettingsStore((s) => s.preferredLanguage);
  const regrouping = useUiSettingsStore((s) => s.regrouping);
  const [items, setItems] = useState<BillboardItem[]>(() => lastBySection.get(section) ?? []);
  const [ready, setReady] = useState(() => lastBySection.has(section));

  const hasCatalog = sections[section].itemCount > 0;
  // MEME cle que l'accueil (useHomeFeed) : le memo des tendances est partage.
  const catalogKey = `${sections.vod.itemCount}:${sections.series.itemCount}:${sections.vod.lastFetchAt ?? 0}`;

  useEffect(() => {
    if (!hasCatalog || regrouping) return;
    let alive = true;
    void loadTrending(10, `${catalogKey}:${preferredLanguage}`)
      .then((trending) => loadBillboard(trending, section))
      .catch(() => [] as BillboardItem[])
      .then((list) => {
        if (!alive) return;
        lastBySection.set(section, list);
        setItems(list);
        setReady(true);
      });
    return () => {
      alive = false;
    };
  }, [section, hasCatalog, regrouping, catalogKey, preferredLanguage]);

  return { items, pending: hasCatalog && !ready };
}
