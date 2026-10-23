'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useLandscapeFullscreen } from '@/hooks/useLandscapeFullscreen';
import { cn } from '@/lib/cn';

/**
 * Telephone a l'horizontale : le lecteur couvre tout l'ecran (CSS seul — iOS
 * refuse le plein ecran natif sans geste) puis le 1er tap ouvre le lecteur
 * NATIF. Meme <video> : la lecture continue en tournant l'appareil. Le
 * PlayerSlot enfant doit avoir `layout="live"` et `className="phone-land:h-full"`.
 */
export function LandscapeStage({ video, children }: { video: HTMLVideoElement | null; children: ReactNode }) {
  const { landscape, fullscreen } = useLandscapeFullscreen(video);
  const [hint, setHint] = useState(false);

  useEffect(() => {
    if (!landscape || fullscreen) {
      setHint(false);
      return;
    }
    setHint(true);
    const timer = setTimeout(() => setHint(false), 3000);
    return () => clearTimeout(timer);
  }, [landscape, fullscreen]);

  return (
    <div
      className={cn(
        'relative',
        'phone-land:fixed phone-land:inset-0 phone-land:z-[60] phone-land:rounded-none phone-land:bg-black',
        'phone-land:pb-[env(safe-area-inset-bottom)] phone-land:pl-[env(safe-area-inset-left)] phone-land:pr-[env(safe-area-inset-right)]',
      )}
    >
      {children}
      <div
        className={cn(
          'pointer-events-none absolute inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] z-10 hidden justify-center transition-opacity duration-500 phone-land:flex',
          hint ? 'opacity-100' : 'opacity-0',
        )}
      >
        <span className="glass rounded-full px-3 py-1.5 text-xs font-medium text-fg">
          Touchez l&apos;écran pour le plein écran
        </span>
      </div>
    </div>
  );
}
