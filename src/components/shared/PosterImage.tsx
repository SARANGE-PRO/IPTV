'use client';

import { useState } from 'react';
import { cn } from '@/lib/cn';

/** Image lazy avec fallback texte (les posters IPTV sont souvent morts). */
export function PosterImage({
  src,
  alt,
  className,
}: {
  src: string | null;
  alt: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const show = src !== null && !failed;
  return (
    <div className={cn('relative flex items-center justify-center overflow-hidden bg-ink-800', className)}>
      {show ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="line-clamp-3 px-2 text-center text-xs text-fg-faint">{alt}</span>
      )}
    </div>
  );
}
