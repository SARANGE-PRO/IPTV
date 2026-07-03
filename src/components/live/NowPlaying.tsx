'use client';

import { useEffect, useState } from 'react';
import { nowNext } from '@/services/epg/epgNormalizer';
import { getChannelEpg } from '@/services/epg/epgService';
import type { EpgProgramme } from '@/types/epg';
import type { XtreamCredentials } from '@/types/xtream';

/**
 * Programme TV en cours (EPG) de la chaine ouverte. Chargement A LA DEMANDE
 * (une seule chaine), cache Dexie, non bloquant. Rien ne s'affiche si le
 * fournisseur n'expose pas d'EPG — jamais d'erreur bloquante.
 */

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

export function NowPlaying({
  credentials,
  streamId,
}: {
  credentials: XtreamCredentials | null;
  streamId: string;
}) {
  const [programmes, setProgrammes] = useState<EpgProgramme[] | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    if (credentials === null) return;
    let active = true;
    setProgrammes(null);
    void getChannelEpg(credentials, streamId)
      .then((p) => {
        if (active) setProgrammes(p);
      })
      .catch(() => {
        // Filet defensif : jamais de skeleton infini si l'appel echoue un jour.
        if (active) setProgrammes([]);
      });
    return () => {
      active = false;
    };
  }, [credentials, streamId]);

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  if (programmes === null) {
    return <div className="h-16 animate-pulse rounded-xl bg-ink-800" aria-hidden />;
  }
  if (programmes.length === 0) return null;

  const { current, next } = nowNext(programmes, nowMs);
  if (current === null && next === null) return null;

  const progress =
    current !== null ? Math.min(1, Math.max(0, (nowMs - current.start) / (current.end - current.start))) : 0;

  return (
    <div className="rounded-xl bg-ink-800 p-4">
      {current !== null ? (
        <>
          <div className="flex items-baseline justify-between gap-3">
            <p className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{current.title}</p>
            <span className="shrink-0 text-[11px] text-fg-faint">
              {formatTime(current.start)}–{formatTime(current.end)}
            </span>
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-ink-600">
            <div className="h-full bg-accent" style={{ width: `${progress * 100}%` }} />
          </div>
          {current.description !== null && (
            <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-fg-muted">{current.description}</p>
          )}
        </>
      ) : (
        <p className="text-xs text-fg-muted">Programme en cours indisponible.</p>
      )}
      {next !== null && (
        <p className="mt-2 text-[11px] text-fg-faint">
          À suivre · {formatTime(next.start)} · <span className="text-fg-muted">{next.title}</span>
        </p>
      )}
    </div>
  );
}
