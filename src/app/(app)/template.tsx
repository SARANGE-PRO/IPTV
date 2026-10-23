import type { ReactNode } from 'react';
import { PageTransition } from '@/components/layout/PageTransition';

/** Remonte a chaque changement de page : animation d'entree (voir PageTransition). */
export default function Template({ children }: { children: ReactNode }) {
  return <PageTransition>{children}</PageTransition>;
}
