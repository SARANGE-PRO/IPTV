import { Suspense, type ReactNode } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { FavoriteTabsSheet } from '@/components/favorites/FavoriteTabsSheet';
import { FavoritesToast } from '@/components/favorites/FavoritesToast';
import { AuthGate } from '@/components/layout/AuthGate';
import { PlayerHost } from '@/components/player/host/PlayerHost';
import { DetailModalHost } from '@/components/shared/DetailModalHost';

/** Groupe (app) : session obligatoire + shell de navigation. `DetailModalHost`
 *  ouvre les detail films/series (`?vod=` / `?series=`) en modal par-dessus la
 *  page courante, qui reste montee dessous. Suspense : exige par
 *  useSearchParams au prerendu (export statique). `PlayerHost` : lecteur
 *  unique de l'app (la lecture continue en mini-lecteur quand on quitte la
 *  page ou la fiche qui l'a lancee). Feuille d'onglets + toast des favoris :
 *  globaux, ouverts depuis n'importe quel coeur. */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGate>
      <AppShell>{children}</AppShell>
      <Suspense fallback={null}>
        <DetailModalHost />
      </Suspense>
      <PlayerHost />
      <FavoriteTabsSheet />
      <FavoritesToast />
    </AuthGate>
  );
}
