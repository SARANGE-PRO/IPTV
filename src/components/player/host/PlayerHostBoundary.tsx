'use client';

import type { ReactNode } from 'react';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { usePlayerStore } from '@/stores/playerStore';

/**
 * Frontiere d'erreur du lecteur unique (monte dans le layout, hors de portee de
 * `(app)/error.tsx`) : un plantage du lecteur ne doit pas emporter toute l'app.
 * « Relancer » remonte le lecteur sur la meme session ; « Fermer » l'arrete.
 */
export function PlayerHostBoundary({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary
      fallback={(reset) => (
        <PlayerCrashNotice
          onRetry={reset}
          onClose={() => {
            usePlayerStore.getState().stop();
            reset();
          }}
        />
      )}
    >
      {children}
    </ErrorBoundary>
  );
}

function PlayerCrashNotice({ onRetry, onClose }: { onRetry: () => void; onClose: () => void }) {
  return (
    <div
      role="alert"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-[70] flex justify-center px-4 md:bottom-6 md:pl-60"
    >
      <div className="glass pointer-events-auto flex max-w-md animate-fade-in items-center gap-2 rounded-2xl border border-white/10 py-2 pl-4 pr-2 shadow-2xl shadow-black/50">
        <span className="min-w-0 flex-1 text-sm text-fg">Le lecteur a rencontré un problème.</span>
        <button
          type="button"
          onClick={onRetry}
          className="h-11 shrink-0 rounded-xl px-3 text-sm font-semibold text-accent hover:bg-white/5"
        >
          Relancer
        </button>
        <button
          type="button"
          onClick={onClose}
          className="h-11 shrink-0 rounded-xl px-3 text-sm font-medium text-fg-muted hover:bg-white/5"
        >
          Fermer
        </button>
      </div>
    </div>
  );
}
