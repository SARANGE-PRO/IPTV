'use client';

import './globals.css';

/**
 * Dernier filet : plantage du layout racine ou du layout (app) lui-meme (hors
 * de portee de `(app)/error.tsx`). Remplace tout le document -> styles et
 * textes autonomes, aucune dependance au reste de l'app.
 */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="fr">
      <body className="bg-ink-950 text-fg">
        <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
          <p className="text-lg font-semibold">ZiBTV a rencontré un problème</p>
          <p className="text-sm leading-relaxed text-fg-muted">
            Tes favoris, ta progression et ta session sont conservés sur cet appareil.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={() => reset()}
              className="h-11 rounded-xl bg-accent px-5 text-[15px] font-medium text-white"
            >
              Réessayer
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="h-11 rounded-xl bg-ink-700 px-5 text-[15px] font-medium text-fg"
            >
              Recharger l’app
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
