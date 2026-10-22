'use client';

import { cn } from '@/lib/cn';
import { IconPip } from '@/components/player/playerIcons';
import { usePictureInPicture } from '@/hooks/usePictureInPicture';

/**
 * Bascule « lecture reduite » (Picture-in-Picture). Meme gabarit que
 * FavoriteButton. Ne s'affiche pas si l'appareil ne gere pas le PiP.
 */
export function PipButton({ video, className }: { video: HTMLVideoElement | null; className?: string }) {
  const { supported, active, toggle } = usePictureInPicture(video);
  if (!supported) return null;
  return (
    <button
      type="button"
      aria-label={active ? 'Revenir à la lecture normale' : 'Lecture réduite (PiP)'}
      aria-pressed={active}
      onClick={toggle}
      className={cn(
        'rounded-full bg-black/50 p-2 backdrop-blur transition-colors',
        active ? 'text-accent' : 'text-fg-muted hover:text-fg',
        className,
      )}
    >
      <IconPip className="h-4 w-4" />
    </button>
  );
}
