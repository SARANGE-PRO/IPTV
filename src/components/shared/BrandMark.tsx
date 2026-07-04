import { cn } from '@/lib/cn';

/**
 * Marque ZiBTV seule (symbole), branding SOBRE en tete des pages internes sur
 * mobile (le desktop porte deja le logo complet en sidebar). Discret : jamais de
 * wordmark, opacite reduite, ne concurrence pas le titre de page.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brand/zibtv-mark.svg"
      alt="ZiBTV"
      className={cn(
        'h-7 w-7 shrink-0 object-contain opacity-80 drop-shadow-[0_0_8px_rgba(229,9,20,0.25)]',
        className,
      )}
    />
  );
}
