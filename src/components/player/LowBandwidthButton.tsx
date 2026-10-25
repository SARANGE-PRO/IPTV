'use client';

import { useLowBandwidth } from '@/hooks/useLowBandwidth';

/** Sous un lecteur : active le mode connexion faible en un tap (metro, campagne). */
export function LowBandwidthButton() {
  const { enabled, setEnabled } = useLowBandwidth();
  if (enabled) return null;
  return (
    <button
      type="button"
      onClick={() => setEnabled(true)}
      className="relative hit-44 text-xs font-medium text-fg-muted underline-offset-2 hover:text-fg hover:underline"
    >
      Connexion faible ? Réserver le réseau à la vidéo
    </button>
  );
}
