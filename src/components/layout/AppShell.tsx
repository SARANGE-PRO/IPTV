'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { BrandLogo } from '@/components/shared/BrandLogo';
import { CommandPalette } from '@/components/shared/CommandPalette';
import { SyncProgress } from '@/components/layout/SyncProgress';
import {
  IconFilm,
  IconHeart,
  IconHome,
  IconSearch,
  IconSeries,
  IconSettings,
  IconTv,
} from '@/components/ui/icons';
import { cn } from '@/lib/cn';
import { HOME_HREF, LIVE_HREF, SEARCH_HREF, SETTINGS_HREF } from '@/utils/appRoutes';
import { useAutoSync } from '@/hooks/useAutoSync';
import { useStorageMaintenance } from '@/hooks/useStorageMaintenance';
import { useLowBandwidthLifecycle } from '@/hooks/useLowBandwidth';
import { usePreconnectMedia } from '@/hooks/usePreconnectMedia';
import { useReminderScheduler } from '@/hooks/useReminderScheduler';
import { requestPersistentStorage } from '@/lib/persistStorage';
import { useCatalogStore } from '@/stores/catalogStore';
import { useFavoritesStore } from '@/stores/favoritesStore';
import { useFilterStore } from '@/stores/filterStore';
import { usePlaybackStore } from '@/stores/playbackStore';
import { useUiSettingsStore } from '@/stores/uiSettingsStore';
import { ServerUnverifiedBanner } from '@/components/layout/ServerUnverifiedBanner';
import { LowBandwidthBanner } from '@/components/layout/LowBandwidthBanner';
import { PrivateModeIndicator } from '@/components/privacy/PrivateModeIndicator';

// Reglages (usage rare) : engrenage de l'accueil sur mobile, bas de la barre
// laterale ailleurs. La recherche complete (titres, acteurs, genres) a un onglet.
const NAV = [
  { href: HOME_HREF, label: 'Accueil', icon: IconHome },
  { href: LIVE_HREF, label: 'Live', icon: IconTv },
  { href: '/movies', label: 'Films', icon: IconFilm },
  { href: '/series', label: 'Séries', icon: IconSeries },
  { href: '/favorites', label: 'Favoris', icon: IconHeart },
  { href: SEARCH_HREF, label: 'Recherche', icon: IconSearch },
] as const;

/** Shell : sidebar desktop / bottom-nav mobile + bootstrap des stores. */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const hydrateCatalog = useCatalogStore((s) => s.hydrate);
  const startBackfill = useCatalogStore((s) => s.startBackfill);
  const hydrateFavorites = useFavoritesStore((s) => s.hydrate);
  const hydrateRails = usePlaybackStore((s) => s.hydrateRails);
  const hydrateHidden = useFilterStore((s) => s.hydrateHidden);
  const hydrateDefaults = useFilterStore((s) => s.hydrateDefaults);
  const hydrateUiSettings = useUiSettingsStore((s) => s.hydrate);

  // Planifie les rappels d'evenements (notif premier plan + rattrapage).
  useReminderScheduler();
  // Connexion au serveur de flux preparee avant le premier tap.
  usePreconnectMedia();
  // Catalogue de plus de 7 jours : resynchro de fond.
  useAutoSync();
  // Caches TMDB / EPG perimes : purges en fond (quota iOS partage).
  useStorageMaintenance();
  // Mode connexion faible : etat relu, taches reportees relancees a la sortie.
  useLowBandwidthLifecycle(startBackfill);

  useEffect(() => {
    // Enrichissement TMDB : reprend la ou il s'etait arrete, a CHAQUE lancement
    // (chantier 3) et au retour au premier plan (iOS gele le JS en arriere-plan).
    void hydrateCatalog().then(() => startBackfill());
    const onVisible = () => {
      if (document.visibilityState === 'visible') void startBackfill();
    };
    document.addEventListener('visibilitychange', onVisible);
    void hydrateFavorites();
    void hydrateRails();
    void hydrateHidden();
    void hydrateDefaults();
    void hydrateUiSettings();
    // Reduit les purges de stockage iOS (moins de re-syncs surprises).
    void requestPersistentStorage();
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [hydrateCatalog, startBackfill, hydrateFavorites, hydrateRails, hydrateHidden, hydrateDefaults, hydrateUiSettings]);

  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));
  // Retoucher l'onglet de la page courante = revenir en haut (habitude iOS).
  const scrollTopIfCurrent = (href: string) => {
    if (pathname === href) window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-dvh md:pl-20 lg:pl-60">
      {/* Tablette en portrait / telephone a l'horizontale (< 1024 px) : colonne
          d'icones ; libelles a partir de 1024 px. */}
      <aside className="glass fixed inset-y-0 left-0 z-40 hidden w-20 flex-col border-r border-white/5 px-3 py-8 md:flex lg:w-60 lg:px-4">
        <BrandLogo className="mb-6 justify-center lg:justify-start lg:px-2" markClassName="h-8 w-8" textClassName="hidden text-lg lg:inline" />
        <nav className="flex flex-1 flex-col gap-1">
          {[...NAV, { href: SETTINGS_HREF, label: 'Réglages', icon: IconSettings }].map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={() => scrollTopIfCurrent(href)}
              className={cn(
                'flex min-h-11 items-center justify-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors lg:justify-start',
                href === SETTINGS_HREF && 'mt-auto',
                isActive(href) ? 'bg-ink-700 font-medium text-fg' : 'text-fg-muted hover:bg-ink-800 hover:text-fg',
              )}
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span className="sr-only lg:not-sr-only">{label}</span>
              {href === SEARCH_HREF && (
                <kbd className="ml-auto hidden rounded lg:inline bg-ink-700 px-1.5 py-0.5 text-[10px] font-medium text-fg-muted">⌘K</kbd>
              )}
            </Link>
          ))}
        </nav>
      </aside>

      {/* --zib-mini-offset : place reservee sous le contenu quand le
          mini-lecteur est visible (voir player/host/miniPlayer.css).
          data-zib-sheet : la page glisse et s'efface avec le geste « glisser
          la video vers le bas » (voir player/host/playerGesture). */}
      <div
        data-zib-sheet
        className="pb-[calc(6rem+var(--zib-mini-offset,0px))] pt-safe md:pb-[calc(2rem+var(--zib-mini-offset,0px))]"
      >
        <PrivateModeIndicator />
        <ServerUnverifiedBanner />
        <LowBandwidthBanner />
        {children}
      </div>

      <SyncProgress />
      <CommandPalette />

      <nav className="glass fixed inset-x-0 bottom-0 z-40 border-t border-white/5 pb-safe md:hidden">
        <div className="flex items-stretch justify-around">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                onClick={() => scrollTopIfCurrent(href)}
                className={cn(
                  'flex min-w-0 flex-1 flex-col items-center gap-1 py-2 text-[11px] transition-colors',
                  active ? 'text-accent' : 'text-fg-muted active:text-fg',
                )}
              >
                <span
                  className={cn(
                    'flex h-8 w-12 items-center justify-center rounded-full transition-all',
                    active && 'glow-accent bg-accent/15',
                  )}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <span className="max-w-full truncate">{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
