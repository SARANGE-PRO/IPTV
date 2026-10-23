'use client';

import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { coverPlayerSlots } from '@/components/player/host/playerSurface';
import { useSwipeToClose } from '@/hooks/useSwipeToClose';

/**
 * Conteneur MODAL des detail film/serie (ouverts par `?vod=` / `?series=`, voir
 * DetailModalHost). La page courante reste montee dessous -> recherche,
 * filtres et scroll PRESERVES au retour.
 *
 * Fermeture : clic sur le fond, touche Echap, bouton retour, ou fiche tiree
 * vers le bas depuis son haut (iPhone, voir useSwipeToClose) -> `onClose`
 * (fourni par l'hote : depile l'historique, ou retire le parametre en acces
 * direct). Verrou de scroll de l'arriere-plan.
 */
export function DetailModal({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  // La page dessous est masquee : une lecture qui s'y deroulait passe en
  // mini-lecteur (et y revient a la fermeture de la fiche).
  useLayoutEffect(() => coverPlayerSlots(), []);

  const backdropRef = useRef<HTMLDivElement | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  useSwipeToClose(backdropRef, sheetRef, onClose);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return (
    <div
      ref={backdropRef}
      role="dialog"
      aria-modal="true"
      data-zib-backdrop
      onClick={onClose}
      className="fixed inset-0 z-50 animate-fade-in overflow-y-auto overscroll-contain bg-black/70 backdrop-blur-sm"
    >
      {/* pt-safe : sur iPhone en PWA, sans marge le contenu (retour/favori) passe
          sous l'encoche. Desktop : py-8 centre le modal. */}
      <div className="flex min-h-full items-start justify-center pb-[var(--zib-mini-modal-offset,0px)] pt-safe sm:py-8">
        <div
          ref={sheetRef}
          onClick={(e) => e.stopPropagation()}
          data-zib-sheet
          className="relative w-full max-w-4xl animate-modal-rise overflow-clip phone-land:animate-none bg-ink-950 shadow-2xl shadow-black/60 sm:rounded-3xl sm:border sm:border-ink-700/60"
        >
          {/* Poignee : la fiche se tire vers le bas pour se fermer (telephone). */}
          <span
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1.5 z-30 h-1 w-10 -translate-x-1/2 rounded-full bg-white/30 sm:hidden"
          />
          {children}
        </div>
      </div>
    </div>
  );
}
