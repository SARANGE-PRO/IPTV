'use client';

import Link from 'next/link';
import { EmptyState } from '@/components/shared/EmptyState';
import { Button } from '@/components/ui/Button';
import { IconRefresh } from '@/components/ui/icons';
import { HOME_HREF } from '@/utils/appRoutes';

/**
 * Frontiere d'erreur de la zone applicative : un plantage d'un composant affiche
 * un ecran de reprise (pas un ecran blanc). N'affecte ni la nav ni la session.
 */
export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-16 md:px-8">
      <EmptyState
        title="Une erreur est survenue"
        hint="L'affichage a rencontré un problème. Réessaie — tes données et ta session sont intactes."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={() => reset()}>
              <IconRefresh className="mr-2 h-4 w-4" />
              Réessayer
            </Button>
            {/* Si l'erreur revient : rechargement complet de l'app. */}
            <Button variant="secondary" onClick={() => window.location.reload()}>
              Recharger l&apos;app
            </Button>
            <Link
              href={HOME_HREF}
              className="inline-flex h-11 items-center rounded-xl px-5 text-[15px] font-medium text-fg-muted hover:text-fg"
            >
              Accueil
            </Link>
          </div>
        }
      />
    </main>
  );
}
