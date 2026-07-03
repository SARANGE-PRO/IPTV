'use client';

import { EmptyState } from '@/components/shared/EmptyState';
import { Button } from '@/components/ui/Button';
import { IconRefresh } from '@/components/ui/icons';

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
          <Button onClick={() => reset()}>
            <IconRefresh className="mr-2 h-4 w-4" />
            Réessayer
          </Button>
        }
      />
    </main>
  );
}
