'use client';

import { useEffect, useRef, type RefObject } from 'react';
import { PHONE_LANDSCAPE_QUERY } from '@/utils/videoFullscreen';

/** Deplacement (px) qui decide du sens du geste. */
const DECIDE_PX = 10;
/** Distance (px) ou vitesse (px/ms) au-dela de laquelle on reduit. */
const COMMIT_PX = 110;
const COMMIT_VELOCITY = 0.6;
/** Bande basse de la video reservee aux commandes natives (barre de lecture). */
const CONTROLS_BAND_PX = 52;
/** Distance a laquelle l'effet de reduction est maximal. */
const FULL_EFFECT_PX = 320;

type GestureState = 'idle' | 'pending' | 'drag' | 'ignore';

/**
 * Geste YouTube (mobile) : glisser la video vers le BAS la reduit en
 * mini-lecteur. La video suit le doigt en retrecissant ; relachee assez loin
 * (ou d'un coup sec), elle part en mini-lecteur via `onMinimize`, sinon elle
 * revient en place.
 *
 * N'interfere pas avec le reste : ignore les gestes vers le haut ou lateraux
 * (la page defile normalement), un depart sur la barre de commandes native ou
 * sur un bouton, le multi-touch et le plein ecran paysage. Touch events (et non
 * pointer events) : seul moyen sur iOS d'empecher le defilement de la page des
 * le premier mouvement vers le bas.
 */
export function useSwipeToMinimize(ref: RefObject<HTMLElement | null>, onMinimize: (() => void) | null): void {
  const callbackRef = useRef(onMinimize);
  callbackRef.current = onMinimize;
  const enabled = onMinimize !== null;

  useEffect(() => {
    const el = ref.current;
    if (el === null || !enabled) return;
    const landscape = typeof window.matchMedia === 'function' ? window.matchMedia(PHONE_LANDSCAPE_QUERY) : null;

    let state: GestureState = 'idle';
    let startX = 0;
    let startY = 0;
    let offset = 0;
    let lastY = 0;
    let lastT = 0;
    let velocity = 0;
    let resetTimer: ReturnType<typeof setTimeout> | null = null;

    const apply = (dy: number) => {
      const p = Math.min(dy / FULL_EFFECT_PX, 1);
      el.style.transform = `translate3d(0, ${dy}px, 0) scale(${1 - p * 0.3})`;
      el.style.opacity = String(1 - p * 0.2);
    };
    const reset = (animated: boolean) => {
      el.style.transition = animated ? 'transform 260ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity 260ms ease-out' : '';
      el.style.transform = '';
      el.style.opacity = '';
      if (!animated) {
        el.style.zIndex = '';
        el.style.transformOrigin = '';
      }
    };

    const onStart = (e: TouchEvent) => {
      state = 'ignore';
      const touch = e.touches[0];
      if (e.touches.length !== 1 || touch === undefined || landscape?.matches === true) return;
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest('button, a, input, select, textarea') != null) return;
      const video = el.querySelector('video');
      if (video !== null && touch.clientY > video.getBoundingClientRect().bottom - CONTROLS_BAND_PX) return;
      if (resetTimer !== null) {
        clearTimeout(resetTimer);
        resetTimer = null;
      }
      state = 'pending';
      startX = touch.clientX;
      startY = touch.clientY;
      lastY = touch.clientY;
      lastT = e.timeStamp;
      velocity = 0;
      offset = 0;
    };

    const onMove = (e: TouchEvent) => {
      if (state !== 'pending' && state !== 'drag') return;
      const touch = e.touches[0];
      if (touch === undefined) return;
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      if (state === 'pending') {
        // Vers le bas : on bloque le defilement DES le 1er mouvement (sinon
        // iOS l'engage et ne laisse plus l'annuler). Sinon : geste ignore.
        if (dy <= 0 || Math.abs(dx) > dy) {
          state = 'ignore';
          return;
        }
        if (e.cancelable) e.preventDefault();
        if (dy < DECIDE_PX) return;
        state = 'drag';
        el.style.transition = 'none';
        el.style.transformOrigin = '15% 0';
        el.style.zIndex = '30';
      }
      if (e.cancelable) e.preventDefault();
      offset = Math.max(0, dy);
      apply(offset);
      const dt = e.timeStamp - lastT;
      if (dt > 0) velocity = (touch.clientY - lastY) / dt;
      lastY = touch.clientY;
      lastT = e.timeStamp;
    };

    const onEnd = () => {
      const dragged = state === 'drag';
      state = 'idle';
      if (!dragged) return;
      if (offset >= COMMIT_PX || velocity >= COMMIT_VELOCITY) {
        el.style.transition = 'transform 200ms ease-in, opacity 200ms ease-in';
        el.style.transform = `translate3d(0, ${offset + 160}px, 0) scale(0.55)`;
        el.style.opacity = '0';
        callbackRef.current?.();
        // Filet : si la page ne se ferme pas (navigation refusee), on revient.
        resetTimer = setTimeout(() => reset(true), 900);
      } else {
        reset(true);
      }
      offset = 0;
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
      if (resetTimer !== null) clearTimeout(resetTimer);
      reset(false);
    };
  }, [ref, enabled]);
}
