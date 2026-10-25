'use client';

import { Button } from '@/components/ui/Button';
import { IconRefresh } from '@/components/ui/icons';
import { useCatalogSync } from '@/hooks/useCatalogSync';

/** Bouton « Synchroniser le catalogue » des etats vides (accueil, Live, films, series). */
export function SyncCatalogButton({ size = 'md' }: { size?: 'md' | 'lg' }) {
  const { syncing, canSync, syncNow } = useCatalogSync();
  return (
    <Button size={size} onClick={syncNow} disabled={!canSync}>
      <IconRefresh className="mr-2 h-4 w-4" />
      {syncing ? 'Synchronisation…' : 'Synchroniser le catalogue'}
    </Button>
  );
}
