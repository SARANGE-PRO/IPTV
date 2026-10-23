import { useRef, type MouseEvent, type PointerEvent } from 'react';

const LONG_PRESS_MS = 500;
/** Au-dela, le doigt fait defiler : ce n'est plus un appui long. */
const MOVE_TOLERANCE_PX = 10;

/**
 * Appui long (tactile ou souris) : declenche `onLongPress` apres 500 ms sans
 * bouger, puis avale le clic qui suit (le lien ne s'ouvre pas). A etaler sur
 * l'element cible : `<Link {...useLongPress(open)}>`.
 */
export function useLongPress(onLongPress: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);

  const cancel = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    origin.current = null;
  };

  return {
    onPointerDown: (e: PointerEvent) => {
      if (e.button !== 0) return;
      fired.current = false;
      origin.current = { x: e.clientX, y: e.clientY };
      timer.current = setTimeout(() => {
        timer.current = null;
        fired.current = true;
        onLongPress();
      }, LONG_PRESS_MS);
    },
    onPointerMove: (e: PointerEvent) => {
      const o = origin.current;
      if (o !== null && Math.hypot(e.clientX - o.x, e.clientY - o.y) > MOVE_TOLERANCE_PX) cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onPointerLeave: cancel,
    onClickCapture: (e: MouseEvent) => {
      if (!fired.current) return;
      fired.current = false;
      e.preventDefault();
      e.stopPropagation();
    },
    // Clic droit (souris) / appui long Android : meme action, une seule fois.
    onContextMenu: (e: MouseEvent) => {
      e.preventDefault();
      if (fired.current) return;
      cancel();
      onLongPress();
    },
  };
}
