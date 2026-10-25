'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/authStore';

/**
 * Session ouverte sans verification serveur (lancement hors ligne / serveur
 * en panne) : le catalogue local reste utilisable. Nouvel essai automatique au
 * retour du reseau et au retour dans l'app, ou au tap.
 */
export function ServerUnverifiedBanner() {
  const unverified = useAuthStore((s) => s.serverUnverified);
  const recheck = useAuthStore((s) => s.recheckServer);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!unverified) return;
    const retry = () => {
      if (document.visibilityState === 'visible') void recheck();
    };
    window.addEventListener('online', retry);
    document.addEventListener('visibilitychange', retry);
    return () => {
      window.removeEventListener('online', retry);
      document.removeEventListener('visibilitychange', retry);
    };
  }, [unverified, recheck]);

  if (!unverified) return null;
  return (
    <div role="status" className="mx-4 mt-3 flex items-center gap-3 rounded-xl bg-amber-400/10 px-4 py-2 phone-land:hidden md:mx-8">
      <span className="min-w-0 flex-1 text-xs text-amber-200">
        Serveur injoignable — contenu enregistré sur l’appareil.
      </span>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void recheck().finally(() => setBusy(false));
        }}
        className="relative hit-44 shrink-0 text-xs font-semibold text-amber-300 disabled:opacity-50"
      >
        {busy ? 'Vérification…' : 'Réessayer'}
      </button>
    </div>
  );
}
