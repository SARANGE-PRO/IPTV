'use client';

import { useState } from 'react';
import { Monogram } from '@/components/shared/Monogram';
import { resolveChannelLogo } from '@/services/logos/channelLogoProvider';
import { cn } from '@/lib/cn';
import type { LiveChannel } from '@/types/models';
import { secureUrl } from '@/utils/secureUrl';

/** Logo de chaine : source Xtream si dispo, sinon monogramme premium. */
export function ChannelLogo({
  channel,
  className,
}: {
  channel: Pick<LiveChannel, 'name' | 'logoUrl'>;
  className?: string;
}) {
  const { url } = resolveChannelLogo(channel);
  const safeUrl = secureUrl(url);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const show = safeUrl !== null && safeUrl !== failedUrl;

  if (!show) return <Monogram name={channel.name} className={cn('rounded-lg', className)} />;
  return (
    <div className={cn('overflow-hidden rounded-lg bg-ink-800', className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={safeUrl ?? undefined}
        alt=""
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setFailedUrl(safeUrl)}
        className="h-full w-full object-contain"
      />
    </div>
  );
}
