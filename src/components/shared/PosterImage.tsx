'use client';

import { useState } from 'react';
import { Monogram } from '@/components/shared/Monogram';
import { isImageBroken, markImageBroken } from '@/services/media/brokenImageMemory';
import { cn } from '@/lib/cn';
import { secureImageSrc } from '@/utils/secureUrl';

/**
 * Image lazy avec fallback premium (monogramme). Les posters IPTV/TMDB sont
 * souvent morts : `onError` bascule proprement sans jamais casser l'affichage.
 * Ordre d'image gere par l'appelant (TMDB -> Xtream -> ce fallback local).
 */
export function PosterImage({
  src,
  fallbackSrc,
  alt,
  className,
}: {
  src: string | null;
  fallbackSrc?: string | null;
  alt: string;
  className?: string;
}) {
  const candidates = [secureImageSrc(src), secureImageSrc(fallbackSrc)]
    .filter((value): value is string => value !== null)
    .filter((value, index, all) => all.indexOf(value) === index)
    .filter((value) => !isImageBroken(value));
  const [failed, setFailed] = useState<Set<string>>(() => new Set());
  const safeSrc = candidates.find((candidate) => !failed.has(candidate)) ?? null;
  const show = safeSrc !== null;

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
        onError={() => {
          if (safeSrc !== null) {
            markImageBroken(safeSrc);
            setFailed((previous) => new Set(previous).add(safeSrc));
          }
        }}
        className="h-full w-full object-cover"
      />
    </div>
  );
}
