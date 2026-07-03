'use client';

import { Button } from '@/components/ui/Button';
import { IconPlay } from '@/components/ui/icons';
import { cn } from '@/lib/cn';
import { openInVlc } from '@/utils/externalPlayer';

/**
 * Lecture via VLC (lecteur natif). `streamUrl` = URL DIRECTE Xtream (pas la
 * passerelle) : VLC sort par l'IP de l'appareil et decode tout (MKV/HEVC…).
 */
export function ExternalPlayer({
  streamUrl,
  label = 'Lire dans VLC',
  onStarted,
  className,
}: {
  streamUrl: string;
  label?: string;
  onStarted?: () => void;
  className?: string;
}) {
  return (
    <Button
      size="lg"
      variant="secondary"
      className={className}
      onClick={() => {
        onStarted?.();
        openInVlc(streamUrl);
      }}
    >
      <IconPlay className={cn('mr-2 h-4 w-4')} />
      {label}
    </Button>
  );
}
