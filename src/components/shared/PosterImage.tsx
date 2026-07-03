'use client';

import { useState } from 'react';
import { Monogram } from '@/components/shared/Monogram';
import { cn } from '@/lib/cn';
import { secureUrl } from '@/utils/secureUrl';

/**
 * Image lazy avec fallback premium (monogramme). Les posters IPTV/TMDB sont
 * souvent morts : `onError` bascule proprement sans jamais casser l'affichage.
 * Ordre d'image gere par l'appelant (TMDB -> Xtream -> ce fallback local).
 */
export function PosterImage({
  src,
  alt,
  className,
}: {
  src: string | null;
  alt: string;
  className?: string;
}) {
  const safeSrc = secureUrl(src);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const show = safeSrc !== null && safeSrc !== failedSrc;

  if (!show) return <Monogram name={alt} className={cn('text-lg', className)} />;
  return (
    <div className={cn('overflow-hidden bg-ink-800', className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={safeSrc ?? undefined}
        alt={alt}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setFailedSrc(safeSrc)}
        className="h-full w-full object-cover"
      />
    </div>
  );
}
