'use client';

import { useState } from 'react';
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
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(streamUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // presse-papier indisponible : l'utilisateur peut lire via le bouton VLC
    }
  };

  return (
    <div className={cn('flex flex-col items-start gap-2', className)}>
      <Button
        size="lg"
        onClick={() => {
          onStarted?.();
          openInVlc(streamUrl);
        }}
      >
        <IconPlay className="mr-2 h-4 w-4" />
        {label}
      </Button>
      <button
        type="button"
        onClick={() => void copyLink()}
        className="text-xs text-fg-faint transition-colors hover:text-fg-muted"
      >
        {copied ? 'Lien copié ✓' : 'Copier le lien (autre lecteur)'}
      </button>
    </div>
  );
}
