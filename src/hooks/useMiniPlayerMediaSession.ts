'use client';

import { useEffect } from 'react';
import { applyNowPlaying, clearNowPlaying } from '@/services/player/mediaSessionService';
import type { NowPlayingMedia, PlayerContinuation } from '@/types/nowPlaying';

/**
 * Ecran verrouille / Centre de controle pendant le MINI-LECTEUR : la page qui
 * publiait ces infos est fermee. En plein ecran, la page reprend la main
 * (titre d'episode, suivant/precedent) : on n'efface donc RIEN en quittant le
 * mode mini — seulement quand la lecture s'arrete. `next` : ⏭ = episode suivant.
 */
export function useMiniPlayerMediaSession(
  media: NowPlayingMedia | null,
  mini: boolean,
  next: PlayerContinuation | null = null,
): void {
  const title = media?.title ?? null;
  const subtitle = media?.subtitle ?? null;
  const artwork = media?.artwork ?? null;

  useEffect(() => {
    if (!mini || title === null) return;
    const onNext = next !== null ? () => void next.start() : null;
    const apply = () => applyNowPlaying({ title, subtitle, artwork }, { onNext });
    apply();
    // iOS reinitialise les metadonnees au (re)chargement d'un flux.
    document.addEventListener('playing', apply, true);
    return () => document.removeEventListener('playing', apply, true);
  }, [mini, title, subtitle, artwork, next]);

  const stopped = media === null;
  useEffect(() => {
    if (stopped) clearNowPlaying();
  }, [stopped]);
}
