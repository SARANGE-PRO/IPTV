'use client';

import { PlaybackErrorInfo } from '@/components/player/PlaybackErrorInfo';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { NOT_RETRYABLE } from '@/services/player/playbackMessages';
import type { PlayerPhase } from '@/services/player/playbackSession';
import type { PlayerErrorAction } from '@/types/nowPlaying';
import type { PlaybackFailure, PlaybackContext } from '@/types/playbackDiagnostics';

/**
 * Ce qui se pose PAR-DESSUS la video, seulement hors lecture normale (le
 * lecteur natif reste seul pendant la lecture) : spinner de demarrage /
 * reconnexion / tampon, hors-ligne, echec definitif (Reessayer, actions de la
 * page, diagnostic). Vignette (`compact`) : version minimale, sans boutons.
 */
export function PlayerOverlay({
  phase,
  failure,
  compact,
  onRetry,
  getErrorActions,
  context,
}: {
  phase: PlayerPhase;
  failure: PlaybackFailure | null;
  compact: boolean;
  onRetry: () => void;
  getErrorActions?: () => PlayerErrorAction[];
  context: PlaybackContext;
}) {
  const busy = phase === 'loading' || phase === 'reconnecting' || phase === 'buffering';
  return (
    <>
      {busy && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/40">
          <span
            className={cn('animate-spin rounded-full border-2 border-ink-500 border-t-accent', compact ? 'h-4 w-4' : 'h-8 w-8')}
          />
          {phase === 'reconnecting' && !compact && <span className="text-xs font-medium text-fg-muted">Reconnexion…</span>}
          {phase === 'buffering' && !compact && (
            <span className="text-xs font-medium text-fg-muted">Connexion lente, reprise automatique…</span>
          )}
        </div>
      )}
      {phase === 'offline' && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/75 px-6 text-center">
          {compact ? (
            <span className="text-[10px] font-medium text-fg-muted">Hors ligne</span>
          ) : (
            <>
              <p className="text-sm font-medium text-fg">Connexion perdue</p>
              <p className="text-xs text-fg-muted">La lecture reprendra dès le retour du réseau.</p>
            </>
          )}
        </div>
      )}
      {phase === 'error' && compact && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/80">
          <span className="text-base font-semibold text-accent" aria-hidden>
            !
          </span>
        </div>
      )}
      {phase === 'error' && !compact && (
        // Contenu centre mais defilable : un long message ne deborde plus par le haut.
        <div className="absolute inset-0 overflow-y-auto bg-black/85">
          <div className="flex min-h-full flex-col items-center justify-center gap-3 px-6 py-6 text-center">
            <p className="text-sm leading-relaxed text-fg">{failure?.message}</p>
            <div className="flex flex-wrap justify-center gap-2">
              {(failure === null || !NOT_RETRYABLE.has(failure.code)) && (
                <Button size="sm" variant="secondary" onClick={onRetry}>
                  Réessayer
                </Button>
              )}
              {(getErrorActions?.() ?? []).map((action) => (
                <Button key={action.label} size="sm" variant="secondary" onClick={action.onSelect}>
                  {action.label}
                </Button>
              ))}
            </div>
            {failure !== null && <PlaybackErrorInfo failure={failure} context={context} />}
          </div>
        </div>
      )}
    </>
  );
}
