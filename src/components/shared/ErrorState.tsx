import { EmptyState } from '@/components/shared/EmptyState';
import { Button } from '@/components/ui/Button';
import { IconRefresh } from '@/components/ui/icons';

/**
 * Lecture locale (Dexie) ou reseau en echec : jamais une liste vide trompeuse
 * (« Aucun resultat ») mais un message et « Reessayer ».
 */
export function ErrorState({
  title = 'Chargement impossible',
  hint = 'Le stockage local n’a pas répondu. Réessaie ; si ça persiste, relance une synchronisation.',
  onRetry,
}: {
  title?: string;
  hint?: string;
  onRetry: () => void;
}) {
  return (
    <EmptyState
      title={title}
      hint={hint}
      action={
        <Button variant="secondary" onClick={onRetry}>
          <IconRefresh className="mr-2 h-4 w-4" />
          Réessayer
        </Button>
      }
    />
  );
}
