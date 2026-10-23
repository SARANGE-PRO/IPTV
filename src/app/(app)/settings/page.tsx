'use client';

import { useRouter } from 'next/navigation';
import { AccountCard } from '@/components/settings/AccountCard';
import { AdvancedCard } from '@/components/settings/AdvancedCard';
import { CatalogCard } from '@/components/settings/CatalogCard';
import { DataCard } from '@/components/settings/DataCard';
import { FootballCard } from '@/components/settings/FootballCard';
import { HiddenCategoriesCard } from '@/components/settings/HiddenCategoriesCard';
import { NotificationsCard } from '@/components/settings/NotificationsCard';
import { PlaybackPrefsCard } from '@/components/settings/PlaybackPrefsCard';
import { BrandMark } from '@/components/shared/BrandMark';
import { IconArrowLeft } from '@/components/ui/icons';
import { HOME_HREF } from '@/utils/appRoutes';
import { canGoBack } from '@/utils/navigation';

/**
 * Reglages : de l'usage courant (compte, lecture, catalogue) au plus rare
 * (stockage, outils avances replies). Chaque carte porte sa propre logique.
 */
export default function SettingsPage() {
  const router = useRouter();
  // Hors barre du bas (engrenage de l'accueil) : un retour explicite.
  const goBack = () => (canGoBack() ? router.back() : router.replace(HOME_HREF));

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6 md:px-8">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={goBack}
          aria-label="Retour"
          className="-ml-2 grid h-11 w-11 shrink-0 place-items-center rounded-full text-fg-muted hover:text-fg md:hidden"
        >
          <IconArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="flex-1 text-xl font-semibold text-fg">Réglages</h1>
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
