'use client';

import { Button } from '@/components/ui/Button';
import { IconPlay } from '@/components/ui/icons';
import { cn } from '@/lib/cn';
import { usePlayerStore } from '@/stores/playerStore';
import { openInVlc } from '@/utils/externalPlayer';

/** Arrete la lecture de l'app (connexion liberee) puis ouvre VLC. */
export function launchVlc(streamUrl: string): void {
  usePlayerStore.getState().stop();
  openInVlc(streamUrl);
}

/**
 * Lecture via VLC (lecteur natif). `streamUrl` = URL DIRECTE Xtream (pas la
 * passerelle) : VLC sort par l'IP de l'appareil et decode tout (MKV/HEVC…).
 * La lecture de l'app est d'abord arretee : sur un compte a connexion unique,
 * VLC buterait sinon sur la « limite de connexions ».
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
      variant="secondary"
      className={cn('w-full', className)}
      onClick={() => {
        onStarted?.();
        launchVlc(streamUrl);
      }}
    >
      <IconPlay className={cn('mr-2 h-4 w-4')} />
      {label}
    </Button>
  );
}
