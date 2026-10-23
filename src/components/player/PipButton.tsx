'use client';

import { useEffect, useState } from 'react';
import { IconPip } from '@/components/ui/actionIcons';
import { cn } from '@/lib/cn';
import { isInPip, onPipChange, pipSupported, togglePip } from '@/services/player/pictureInPicture';
import { useUiSettingsStore } from '@/stores/uiSettingsStore';

/**
 * Image dans l'image : la video passe dans une fenetre flottante, puis on peut
 * quitter l'app (elle continue par-dessus les autres apps). Le PiP s'ouvre
 * DANS le tap (exigence iOS) : `togglePip` est appele de facon synchrone.
 * Masque si le PiP est coupe dans les Reglages ou non supporte.
 */
export function PipButton({ video, className }: { video: HTMLVideoElement | null; className?: string }) {
  const pipEnabled = useUiSettingsStore((s) => s.pipEnabled);
  const [supported, setSupported] = useState(false);
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (video === null) {
      setSupported(false);
      setActive(false);
      return;
    }
    setSupported(pipSupported(video));
    setActive(isInPip(video));
    return onPipChange(video, setActive);
  }, [video]);

  if (!pipEnabled || video === null || !supported) return null;

  return (
    <button
      type="button"
      aria-label={active ? 'Revenir dans l’app' : 'Image dans l’image'}
      aria-pressed={active}
      title={active ? 'Revenir dans l’app' : 'Image dans l’image'}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        togglePip(video);
      }}
      className={cn(
        'relative hit-44 grid h-11 w-11 shrink-0 place-items-center rounded-full bg-black/50 backdrop-blur transition-colors',
        active ? 'text-accent' : 'text-fg-muted hover:text-fg',
        className,
      )}
    >
      <IconPip className="h-[18px] w-[18px]" />
    </button>
  );
}
