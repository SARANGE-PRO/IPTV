'use client';

import { useState } from 'react';
import { Monogram } from '@/components/shared/Monogram';
import { fallbackLogoCandidates, primaryLogoUrl } from '@/services/live/channelLogoService';
import { isImageBroken, markImageBroken } from '@/services/media/brokenImageMemory';
import { cn } from '@/lib/cn';
import type { BoolNum, LiveChannel } from '@/types/models';
import { secureImageSrc } from '@/utils/secureUrl';

/**
 * Logo de chaine : IPTV `stream_icon` d'abord ; si l'image echoue, fallback
 * cible (IPTV-Org/Clearbit) UNIQUEMENT pour les chaines FR connues ; sinon
 * monogramme premium. `alternates` = logos des autres versions de la meme
 * chaine, essayes avant les fallbacks externes. Les URLs cassees sont memorisees (pas de retry en boucle).
 */
export function ChannelLogo({
  channel,
  alternates,
  className,
}: {
  channel: Pick<LiveChannel, 'name' | 'logoUrl'> & { isFrench?: BoolNum };
  alternates?: readonly string[];
  className?: string;
}) {
  const candidates = [
    secureImageSrc(primaryLogoUrl(channel)),
    ...(alternates ?? []).map((url) => secureImageSrc(url)),
    ...fallbackLogoCandidates(channel).map((c) => secureImageSrc(c.url)),
  ]
    .filter((value): value is string => value !== null)
    .filter((value, index, all) => all.indexOf(value) === index)
    .filter((value) => !isImageBroken(value));

  const [failed, setFailed] = useState<Set<string>>(() => new Set());
  const safeUrl = candidates.find((value) => !failed.has(value)) ?? null;

  if (safeUrl === null) return <Monogram name={channel.name} className={cn('rounded-lg', className)} />;
  return (
    <div className={cn('overflow-hidden rounded-lg bg-ink-800', className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={safeUrl}
        src={safeUrl}
        alt=""
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => {
          markImageBroken(safeUrl);
          setFailed((previous) => new Set(previous).add(safeUrl));
        }}
        className="h-full w-full object-contain"
      />
    </div>
  );
}
