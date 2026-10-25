'use client';

import { usePrivateAutoLock, usePrivateMode } from '@/hooks/usePrivateMode';

/** Masque (icone du mode prive). */
export function IconMask({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden>
      <path
        d="M3 9c0-1.1.9-2 2-2h14a2 2 0 0 1 2 2v1.5c0 3.6-2.6 6.5-5.5 6.5-1.6 0-2.6-1-3.5-2.4-.9 1.4-1.9 2.4-3.5 2.4C5.6 17 3 14.1 3 10.5V9Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="8.5" cy="11" r="1.4" fill="currentColor" />
      <circle cx="15.5" cy="11" r="1.4" fill="currentColor" />
    </svg>
  );
}

/**
 * Mode prive visible PARTOUT sans aller dans les Reglages : liseré violet
 * fixe tout en haut (meme sur le lecteur et en paysage) + bandeau « Mode
 * prive · Quitter » en tete de chaque page. Monte le verrou automatique.
 */
export function PrivateModeIndicator() {
  const { active, exit } = usePrivateMode();
  usePrivateAutoLock();
  if (!active) return null;
  return (
    <>
      <div
        aria-hidden
        style={{ top: 'env(safe-area-inset-top)' }}
        className="pointer-events-none fixed inset-x-0 z-[90] h-[3px] bg-violet-500 shadow-[0_0_12px_rgba(139,92,246,0.8)]"
      />
      <div
        role="status"
        className="mx-4 mt-3 flex items-center gap-3 rounded-xl bg-violet-500/15 px-4 py-2 ring-1 ring-violet-400/30 md:mx-8"
      >
        <IconMask className="h-5 w-5 shrink-0 text-violet-300" />
        <span className="min-w-0 flex-1 text-xs text-violet-100">
          <span className="font-semibold">Mode privé</span> · favoris et historique séparés
        </span>
        <button type="button" onClick={exit} className="relative hit-44 shrink-0 text-xs font-semibold text-violet-300">
          Quitter
        </button>
      </div>
    </>
  );
}
