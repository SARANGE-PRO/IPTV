import type { ReactNode } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { AuthGate } from '@/components/layout/AuthGate';

/** Groupe (app) : session obligatoire + shell de navigation. Le slot parallele
 *  `modal` accueille les detail films/series ouverts en navigation douce
 *  (intercepting routes) — la page liste/recherche reste montee dessous. */
export default function AppLayout({ children, modal }: { children: ReactNode; modal: ReactNode }) {
  return (
    <AuthGate>
      <AppShell>{children}</AppShell>
      {modal}
    </AuthGate>
  );
}
