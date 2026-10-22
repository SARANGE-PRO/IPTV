'use client';

import { useCallback, useEffect, useState } from 'react';
import { enterPip, exitPip, isInPip, isPipSupported, PIP_EVENTS } from '@/utils/pictureInPicture';

export interface PictureInPictureState {
  /** Faux tant que la video n'est pas montee, ou si l'appareil ne gere pas le PiP. */
  supported: boolean;
  active: boolean;
  /** A appeler DIRECTEMENT dans un gestionnaire de clic (exigence iOS). */
  toggle: () => void;
}

/** Etat et bascule du PiP pour une <video> donnee. */
export function usePictureInPicture(video: HTMLVideoElement | null): PictureInPictureState {
  const [supported, setSupported] = useState(false);
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (video === null) {
      setSupported(false);
      setActive(false);
      return;
    }
    setSupported(isPipSupported(video));
    const sync = () => setActive(isInPip(video));
    sync();
    for (const name of PIP_EVENTS) video.addEventListener(name, sync);
    return () => {
      for (const name of PIP_EVENTS) video.removeEventListener(name, sync);
    };
  }, [video]);

  const toggle = useCallback(() => {
    if (video === null) return;
    void (isInPip(video) ? exitPip(video) : enterPip(video));
  }, [video]);

  return { supported, active, toggle };
}
