'use client';

import { useEffect } from 'react';
import {
  ZIB_INTRO_ATTR,
  ZIB_INTRO_END_ANIMATION,
  ZIB_INTRO_TOTAL_MS,
} from '@/components/layout/intro/zibIntroBoot';

/** Marge du filet de securite au-dela de la duree nominale. */
const SAFETY_MARGIN_MS = 1500;

/**
 * Retire l'overlay (display:none) une fois l'intro terminee, pour liberer les
 * calques GPU. Purement du nettoyage : visuellement, l'overlay est deja
 * invisible et non cliquable a la fin de l'animation CSS, meme si ce composant
 * ne s'hydrate jamais. Idempotent (StrictMode : double montage sans effet).
 */
export function ZibIntroController() {
  useEffect(() => {
    const root = document.documentElement;
    if (root.getAttribute(ZIB_INTRO_ATTR) !== 'play') return;

    const overlay = document.getElementById('zib-intro');
    const finish = () => root.removeAttribute(ZIB_INTRO_ATTR);
    if (overlay === null) {
      finish();
      return;
    }

    // `animationend` n'est accepte qu'en fin REELLE (elapsedTime > 0) : un
    // retour en arriere dans la timeline (inspecteur, seek) en emet un a 0.
    // `animationcancel` = animation retiree (preference de mouvement changee
    // en cours de route...) -> on nettoie aussi.
    const onEnd = (event: AnimationEvent) => {
      if (event.target !== overlay || event.animationName !== ZIB_INTRO_END_ANIMATION) return;
      if (event.type === 'animationend' && event.elapsedTime <= 0) return;
      finish();
    };
    overlay.addEventListener('animationend', onEnd);
    overlay.addEventListener('animationcancel', onEnd);
    const timer = window.setTimeout(finish, ZIB_INTRO_TOTAL_MS + SAFETY_MARGIN_MS);

    return () => {
      overlay.removeEventListener('animationend', onEnd);
      overlay.removeEventListener('animationcancel', onEnd);
      window.clearTimeout(timer);
    };
  }, []);

  return null;
}
