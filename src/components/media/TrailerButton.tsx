'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/Button';
import { IconFilmReel, IconX } from '@/components/ui/icons';
import { youtubeEmbedUrl } from '@/utils/youtube';

/**
 * Bande-annonce YouTube (youtube-nocookie) en surimpression plein ecran. Ce
 * n'est PAS un flux Xtream : aucune connexion fournisseur consommee. Echap ou
 * la croix ferment UNIQUEMENT la bande-annonce (la fiche reste ouverte).
 */
export function TrailerButton({ videoId, size = 'lg' }: { videoId: string; size?: 'md' | 'lg' }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation(); // phase de capture : la fiche ne recoit pas l'Echap
      setOpen(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open]);

  return (
    <>
      <Button size={size} variant="secondary" onClick={() => setOpen(true)}>
        <IconFilmReel className="h-5 w-5" />
        Bande-annonce
      </Button>
      {open &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Bande-annonce"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-[70] flex animate-fade-in items-center justify-center bg-black/90 p-4 pt-safe"
          >
            <div onClick={(e) => e.stopPropagation()} className="relative w-full max-w-5xl">
              <button
                type="button"
                aria-label="Fermer la bande-annonce"
                onClick={() => setOpen(false)}
                className="fixed right-[max(1rem,env(safe-area-inset-right))] top-[calc(env(safe-area-inset-top)+0.75rem)] z-[71] grid h-11 w-11 place-items-center rounded-full bg-white/15 text-white hover:bg-white/25"
              >
                <IconX className="h-5 w-5" />
              </button>
              <iframe
                src={youtubeEmbedUrl(videoId)}
                title="Bande-annonce"
                allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
                className="aspect-video w-full rounded-2xl bg-black"
              />
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
