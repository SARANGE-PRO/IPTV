'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { BrandLogo } from '@/components/shared/BrandLogo';
import { SyncProgress } from '@/components/layout/SyncProgress';
import {
  IconFilm,
  IconHeart,
  IconHome,
  IconSeries,
  IconSettings,
  IconTv,
} from '@/components/ui/icons';
import { cn } from '@/lib/cn';
import { requestPersistentStorage } from '@/lib/persistStorage';
import { useCatalogStore } from '@/stores/catalogStore';
import { useFavoritesStore } from '@/stores/favoritesStore';
import { useFilterStore } from '@/stores/filterStore';
import { usePlaybackStore } from '@/stores/playbackStore';
import { useUiSettingsStore } from '@/stores/uiSettingsStore';

const NAV = [
  { href: '/', label: 'Accueil', icon: IconHome },
  { href: '/live', label: 'Live', icon: IconTv },
  { href: '/movies', label: 'Films', icon: IconFilm },
  { href: '/series', label: 'Séries', icon: IconSeries },
  { href: '/favorites', label: 'Favoris', icon: IconHeart },
  { href: '/settings', label: 'Réglages', icon: IconSettings },
] as const;

/** Shell : sidebar desktop / bottom-nav mobile + bootstrap des stores. */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const hydrateCatalog = useCatalogStore((s) => s.hydrate);
  const hydrateFavorites = useFavoritesStore((s) => s.hydrate);
  const hydrateRails = usePlaybackStore((s) => s.hydrateRails);
  const hydrateHidden = useFilterStore((s) => s.hydrateHidden);
  const hydrateDefaults = useFilterStore((s) => s.hydrateDefaults);
  const hydrateUiSettings = useUiSettingsStore((s) => s.hydrate);

  useEffect(() => {
    void hydrateCatalog();
    void hydrateFavorites();
    void hydrateRails();
    void hydrateHidden();
    void hydrateDefaults();
    void hydrateUiSettings();
    // Reduit les purges de stockage iOS (moins de re-syncs surprises).
    void requestPersistentStorage();
  }, [hydrateCatalog, hydrateFavorites, hydrateRails, hydrateHidden, hydrateDefaults, hydrateUiSettings]);

  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  return (
    <div className="min-h-dvh md:pl-60">
      <aside className="glass fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-white/5 px-4 py-8 md:flex">
        <BrandLogo className="mb-8 px-2" markClassName="h-8 w-8" textClassName="text-lg" />
        <nav className="flex flex-col gap-1">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors',
                isActive(href) ? 'bg-ink-700 font-medium text-fg' : 'text-fg-muted hover:bg-ink-800 hover:text-fg',
              )}
            >
              <Icon className="h-5 w-5" />
              {label}
            </Link>
          ))}
        </nav>
      </aside>

      <div className="pb-24 pt-safe md:pb-8">{children}</div>

      <SyncProgress />

      <nav className="glass fixed inset-x-0 bottom-0 z-40 border-t border-white/5 pb-safe md:hidden">
        <div className="flex items-stretch justify-around">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-w-0 flex-1 flex-col items-center gap-1 py-2 text-[10px] transition-colors',
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
