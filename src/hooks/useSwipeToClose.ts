import { useEffect, type RefObject } from 'react';

/** Distance (px) ou coup sec (px/ms) qui ferment au relachement. */
const CLOSE_PX = 110;
const CLOSE_VELOCITY = 0.6;
const DECIDE_PX = 8;
const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
/** Zones qui ont leur propre geste (lecteur) ou la saisie (champs). */
const OWN_GESTURE = '[data-player-slot], input, textarea, select';

/**
 * Fiche plein ecran (iPhone) : tiree vers le bas depuis le HAUT de son
 * defilement, elle suit le doigt puis se ferme (ou revient en place). Plus
 * bas dans la fiche, le geste est un simple defilement.
 */
export function useSwipeToClose(
  scrollRef: RefObject<HTMLElement | null>,
  sheetRef: RefObject<HTMLElement | null>,
  onClose: () => void,
): void {
  useEffect(() => {
    const scroller = scrollRef.current;
    const sheet = sheetRef.current;
    if (scroller === null || sheet === null) return;

    let start: { x: number; y: number; t: number; id: number } | null = null;
    let dragging = false;
    let offset = 0;
    let last = { y: 0, t: 0 };
    let velocity = 0;

    const reset = () => {
      start = null;
      dragging = false;
      offset = 0;
    };

    const onStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (e.touches.length !== 1 || touch === undefined || scroller.scrollTop > 0) return;
      const el = e.target instanceof Element ? e.target : null;
      if (el?.closest(OWN_GESTURE) != null) return;
      start = { x: touch.clientX, y: touch.clientY, t: e.timeStamp, id: touch.identifier };
      last = { y: touch.clientY, t: e.timeStamp };
      velocity = 0;
    };

    const onMove = (e: TouchEvent) => {
      if (start === null) return;
      const touch = Array.from(e.touches).find((t) => t.identifier === start?.id);
      if (touch === undefined) return;
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      if (!dragging) {
        // Vers le haut, de cote, ou la fiche a defile entre-temps : on laisse faire.
        if (dy < 0 || Math.abs(dx) > Math.abs(dy) || scroller.scrollTop > 0) {
          reset();
          return;
        }
        if (dy < DECIDE_PX) return;
        dragging = true;
        // L'animation d'entree (fill « both ») l'emporterait sur nos styles.
        for (const animation of sheet.getAnimations()) animation.cancel();
        sheet.style.transition = 'none';
      }
      if (e.cancelable) e.preventDefault();
      offset = Math.max(0, dy);
      const dt = e.timeStamp - last.t;
      if (dt > 0) velocity = (touch.clientY - last.y) / dt;
      last = { y: touch.clientY, t: e.timeStamp };
      sheet.style.transform = `translate3d(0, ${offset}px, 0)`;
      scroller.style.backgroundColor = `rgba(0, 0, 0, ${Math.max(0, 0.7 - offset / 600)})`;
    };

    const onEnd = () => {
      if (!dragging) {
        reset();
        return;
      }
      const close = offset >= CLOSE_PX || velocity >= CLOSE_VELOCITY;
      sheet.style.transition = `transform 240ms ${EASE}`;
      if (close) {
        sheet.style.transform = 'translate3d(0, 100vh, 0)';
        setTimeout(onClose, 200);
      } else {
        sheet.style.transform = '';
        scroller.style.backgroundColor = '';
        setTimeout(() => {
          sheet.style.transition = '';
        }, 260);
      }
      reset();
    };

    scroller.addEventListener('touchstart', onStart, { passive: true });
    scroller.addEventListener('touchmove', onMove, { passive: false });
    scroller.addEventListener('touchend', onEnd);
    scroller.addEventListener('touchcancel', onEnd);
    return () => {
      scroller.removeEventListener('touchstart', onStart);
      scroller.removeEventListener('touchmove', onMove);
      scroller.removeEventListener('touchend', onEnd);
      scroller.removeEventListener('touchcancel', onEnd);
    };
  }, [scrollRef, sheetRef, onClose]);
}
