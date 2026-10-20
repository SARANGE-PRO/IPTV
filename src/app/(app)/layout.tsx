import { Suspense, type ReactNode } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { AuthGate } from '@/components/layout/AuthGate';
import { DetailModalHost } from '@/components/shared/DetailModalHost';

/** Groupe (app) : session obligatoire + shell de navigation. `DetailModalHost`
 *  ouvre les detail films/series (`?vod=` / `?series=`) en modal par-dessus la
 *  page courante, qui reste montee dessous. Suspense : exige par
 *  useSearchParams au prerendu (export statique). */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGate>
      <AppShell>{children}</AppShell>
      <Suspense fallback={null}>
        <DetailModalHost />
      </Suspense>
    </AuthGate>
  );
}
