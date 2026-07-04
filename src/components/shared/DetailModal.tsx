'use client';

import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';

/**
 * Conteneur MODAL des pages detail (intercepting routes). En navigation douce
 * depuis une liste/recherche, le detail s'ouvre ICI par-dessus la page courante
 * qui reste montee -> recherche, filtres et scroll PRESERVES au retour.
 *
 * Fermeture : clic sur le fond, touche Echap, ou bouton retour -> `router.back()`
 * (depile l'entree d'historique du modal). Verrou de scroll de l'arriere-plan.
 */
export function DetailModal({ children }: { children: ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    const close = () => router.back();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [router]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={() => router.back()}
      className="fixed inset-0 z-50 animate-fade-in overflow-y-auto overscroll-contain bg-black/70 backdrop-blur-sm"
    >
      <div className="flex min-h-full items-start justify-center sm:py-8">
        <div
          onClick={(e) => e.stopPropagation()}
          className="relative w-full max-w-4xl bg-ink-950 shadow-2xl shadow-black/60 sm:rounded-3xl sm:border sm:border-ink-700/60"
        >
          {children}
        </div>
      </div>
    </div>
  );
}
