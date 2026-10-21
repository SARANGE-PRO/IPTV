'use client';

import { useState } from 'react';
import { BrandLogo } from '@/components/shared/BrandLogo';
import { Button } from '@/components/ui/Button';
import { IconRefresh, IconTrash } from '@/components/ui/icons';

/**
 * La base locale (IndexedDB) n'a pas pu s'ouvrir : on le DIT, avec deux
 * sorties — recharger (mise a jour interrompue, onglet ferme entre-temps) ou
 * reinitialiser le stockage local (reset de secours, confirme). Le detail
 * technique (nom + message d'erreur, sans donnee sensible) aide au diagnostic.
 */
export function StorageErrorScreen({ detail, onReset }: { detail: string | null; onReset: () => void }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-ink-950 px-6 text-center">
      <BrandLogo markClassName="h-12 w-12" textClassName="text-2xl" />
      <div className="max-w-sm">
        <p className="text-base font-semibold text-fg">Le stockage local ne répond pas</p>
        <p className="mt-2 text-sm leading-relaxed text-fg-muted">
          ZiBTV n’a pas pu ouvrir sa base de données sur cet appareil. Recharge l’app ; si le problème persiste,
          réinitialise le stockage local (le catalogue sera resynchronisé et il faudra te reconnecter).
        </p>
        {detail !== null && (
          <p className="mt-3 break-words rounded-lg bg-ink-800 px-3 py-2 text-left text-[11px] text-fg-faint">{detail}</p>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button onClick={() => window.location.reload()}>
          <IconRefresh className="mr-2 h-4 w-4" />
          Recharger
        </Button>
        {confirm ? (
          <Button variant="secondary" onClick={onReset}>
            <IconTrash className="mr-2 h-4 w-4" />
            Confirmer la réinitialisation
          </Button>
        ) : (
          <Button variant="secondary" onClick={() => setConfirm(true)}>
            <IconTrash className="mr-2 h-4 w-4" />
            Réinitialiser le stockage local
          </Button>
        )}
      </div>
    </div>
  );
}
