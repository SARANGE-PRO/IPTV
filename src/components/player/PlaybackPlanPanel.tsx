'use client';

import type { ReactNode } from 'react';
import { DirectMkvProbe } from '@/components/player/DirectMkvProbe';
import { ExternalPlayer } from '@/components/player/ExternalPlayer';
import { Button } from '@/components/ui/Button';
import type { PlaybackMode } from '@/hooks/usePlaybackPlan';
import { isGatewayConfigured } from '@/services/player/mediaGatewayService';
import type { ResolvedPlaybackMode } from '@/services/player/playbackPlanService';
import { useUiSettingsStore } from '@/stores/uiSettingsStore';

/**
 * Zone de lecture d'une fiche selon le plan (usePlaybackPlan) :
 *  - 'vlc-only' : format illisible sur l'appareil -> explication, passerelle
 *    (si configuree) ou VLC (si active dans les Reglages, dernier recours) ;
 *  - 'checking' : sonde passerelle en cours (bref) ;
 *  - sinon : le lecteur (`children(plan)`, plan lisible in-app), puis VLC
 *    sous le lecteur si active.
 */
export function PlaybackPlanPanel({
  plan,
  src,
  subject,
  container,
  failed,
  vlcLabel,
  vlcOnlyLabel,
  onRetryGateway,
  children,
}: {
  plan: PlaybackMode;
  src: string;
  /** « Ce film » / « Cet épisode » (message du format illisible). */
  subject: string;
  container: string | null;
  /** Echec definitif signale par le lecteur : le libelle VLC le dit. */
  failed: boolean;
  /** Libelle VLC sous un lecteur qui fonctionne. */
  vlcLabel: string;
  /** Libelle VLC quand seul VLC peut lire le format. */
  vlcOnlyLabel: string;
  onRetryGateway: () => void;
  /** Rendu du lecteur, appele seulement pour un plan lisible dans l'app. */
  children: (plan: Exclude<ResolvedPlaybackMode, 'vlc-only'>) => ReactNode;
}) {
  const showVlcButton = useUiSettingsStore((s) => s.showVlcButton);

  if (plan === 'vlc-only') {
    const gateway = isGatewayConfigured();
    return (
      <div className="rounded-2xl bg-ink-800 p-6 text-center">
        <p className="text-sm text-fg">
          {subject} est en {container?.toUpperCase() ?? 'un format non lisible'} — un iPhone ou iPad ne le décode
          pas dans le navigateur.
        </p>
        {(gateway || showVlcButton) && (
          <>
            <p className="mt-1.5 text-xs text-fg-muted">
              {gateway && showVlcButton
                ? 'Allume la passerelle pour le lire ici, ou ouvre-le dans VLC (lecture native).'
                : gateway
                  ? 'Allume la passerelle pour le lire ici.'
                  : 'Tu peux l’ouvrir dans VLC (lecture native).'}
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
              {gateway && (
                <Button size="sm" variant="secondary" onClick={onRetryGateway}>
                  Réessayer la passerelle
                </Button>
              )}
              {/* VLC : dernier recours, seulement si active dans les Reglages. */}
              {showVlcButton && <ExternalPlayer streamUrl={src} label={vlcOnlyLabel} />}
            </div>
          </>
        )}
        <DirectMkvProbe streamUrl={src} />
      </div>
    );
  }

  if (plan === 'checking') {
    return (
      <div className="flex aspect-video items-center justify-center rounded-2xl bg-black">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-ink-500 border-t-accent" />
      </div>
    );
  }

  return (
    <>
      {children(plan)}
      {/* VLC : meme place pour film, episode et Live, juste sous le lecteur. */}
      {showVlcButton && (
        <ExternalPlayer streamUrl={src} label={failed ? 'Ça ne marche pas ici ? Ouvrir dans VLC' : vlcLabel} />
      )}
    </>
  );
}
