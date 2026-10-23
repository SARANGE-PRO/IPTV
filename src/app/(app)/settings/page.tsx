'use client';

import { AccountCard } from '@/components/settings/AccountCard';
import { AdvancedCard } from '@/components/settings/AdvancedCard';
import { CatalogCard } from '@/components/settings/CatalogCard';
import { DataCard } from '@/components/settings/DataCard';
import { FootballCard } from '@/components/settings/FootballCard';
import { HiddenCategoriesCard } from '@/components/settings/HiddenCategoriesCard';
import { NotificationsCard } from '@/components/settings/NotificationsCard';
import { PlaybackPrefsCard } from '@/components/settings/PlaybackPrefsCard';
import { BrandMark } from '@/components/shared/BrandMark';

/**
 * Reglages : de l'usage courant (compte, lecture, catalogue) au plus rare
 * (stockage, outils avances replies). Chaque carte porte sa propre logique.
 */
export default function SettingsPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6 md:px-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-fg">Réglages</h1>
        <span className="md:hidden">
          <BrandMark />
        </span>
      </div>

      <AccountCard />
      <PlaybackPrefsCard />
      <CatalogCard />
      <HiddenCategoriesCard />
      <FootballCard />
      <NotificationsCard />
      <DataCard />
      <AdvancedCard />
    </main>
  );
}
