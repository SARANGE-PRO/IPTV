'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { PinPad } from '@/components/privacy/PinPad';
import { IconMask } from '@/components/privacy/PrivateModeIndicator';
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
import { useLongPress } from '@/hooks/useLongPress';
import { usePrivateMode } from '@/hooks/usePrivateMode';
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
  const privateMode = usePrivateMode();
  const [pinOpen, setPinOpen] = useState(false);
  const secretPress = useLongPress(() => {
    if (!privateMode.active) setPinOpen(true);
  });

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
        {/* Appui long sur le logo : entree DISCRETE du mode prive (code). */}
        <span {...secretPress} className="grid h-11 w-11 select-none place-items-center [-webkit-touch-callout:none]">
          <BrandMark className="pointer-events-none" />
        </span>
      </div>

      {privateMode.active && (
        <section className="flex items-center gap-3 rounded-2xl bg-violet-500/15 p-4 ring-1 ring-violet-400/30">
          <IconMask className="h-6 w-6 shrink-0 text-violet-300" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-fg">Mode privé actif</span>
            <span className="block text-xs text-fg-muted">
              Favoris, onglets, reprises, récentes et recherches séparés. Se referme à la fermeture de l’app ou après
              15 min hors de l’app.
            </span>
          </span>
          <button
            type="button"
            onClick={privateMode.exit}
            className="h-11 shrink-0 rounded-xl bg-violet-500/25 px-4 text-sm font-semibold text-violet-100"
          >
            Quitter
          </button>
        </section>
      )}
      {pinOpen && (
        <PinPad
          onSubmit={(pin) => {
            const result = privateMode.tryUnlock(pin);
            if (result === 'ok') privateMode.enter();
            return result;
          }}
          lockedUntil={() => privateMode.pinLockedUntil()}
          onClose={() => setPinOpen(false)}
        />
      )}

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
