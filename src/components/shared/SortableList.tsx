'use client';

import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Liste verticale reordonnable au doigt / a la souris via une poignee
 * (`touch-action: none` sur la poignee : le reste de la ligne fait defiler
 * la page normalement sur iPhone). Defilement automatique pres des bords.
 * Aucune dependance : Pointer Events + transform.
 */

export interface HandleProps {
  onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void;
  style: { touchAction: 'none' };
  'aria-label': string;
}

interface DragState {
  from: number;
  to: number;
  dy: number;
}

const EDGE = 72;
const EDGE_SPEED = 10;

export function SortableList({
  keys,
  onReorder,
  renderItem,
  className,
}: {
  keys: string[];
  onReorder: (keys: string[]) => void;
  renderItem: (key: string, handle: HandleProps, dragging: boolean) => ReactNode;
  className?: string;
}) {
  const itemRefs = useRef(new Map<string, HTMLDivElement>());
  const [drag, setDrag] = useState<DragState | null>(null);

  const start = (index: number) => (e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    // Rectangles en coordonnees PAGE : stables meme si la page defile.
    const rects = keys.map((key) => {
      const r = itemRefs.current.get(key)?.getBoundingClientRect();
      return r !== undefined ? { top: r.top + window.scrollY, height: r.height } : { top: 0, height: 0 };
    });
    const startY = e.clientY + window.scrollY;
    const dragged = rects[index]!;
    let state: DragState = { from: index, to: index, dy: 0 };
    setDrag(state);

    // Nouvelle place = derniere ligne dont le milieu a ete franchi par le centre
    // de la ligne deplacee.
    const targetFor = (centerY: number): number => {
      let target = index;
      for (let i = 0; i < rects.length; i++) {
        if (i === index) continue;
        const mid = rects[i]!.top + rects[i]!.height / 2;
        if (i < index && centerY < mid) target = Math.min(target, i);
        if (i > index && centerY > mid) target = Math.max(target, i);
      }
      return target;
    };

    const onMove = (ev: PointerEvent) => {
      if (ev.clientY < EDGE) window.scrollBy(0, -EDGE_SPEED);
      else if (ev.clientY > window.innerHeight - EDGE) window.scrollBy(0, EDGE_SPEED);
      const dy = ev.clientY + window.scrollY - startY;
      state = { from: index, to: targetFor(dragged.top + dragged.height / 2 + dy), dy };
      setDrag(state);
    };
    const onEnd = () => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onEnd);
      handle.removeEventListener('pointercancel', onEnd);
      setDrag(null);
      if (state.to !== state.from) {
        const next = [...keys];
        const [moved] = next.splice(state.from, 1);
        next.splice(state.to, 0, moved!);
        onReorder(next);
      }
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onEnd);
    handle.addEventListener('pointercancel', onEnd);
  };

  const shiftOf = (i: number): number => {
    if (drag === null || i === drag.from) return 0;
    const height = itemRefs.current.get(keys[drag.from]!)?.offsetHeight ?? 0;
    if (drag.from < drag.to && i > drag.from && i <= drag.to) return -height;
    if (drag.from > drag.to && i >= drag.to && i < drag.from) return height;
    return 0;
  };

  return (
    <div className={className}>
      {keys.map((key, i) => {
        const dragging = drag?.from === i;
        return (
          <div
            key={key}
            ref={(el) => {
              if (el !== null) itemRefs.current.set(key, el);
              else itemRefs.current.delete(key);
            }}
            style={{ transform: `translateY(${dragging ? drag.dy : shiftOf(i)}px)` }}
            className={cn(
              'relative',
              dragging
                ? 'z-10 rounded-xl bg-ink-800 shadow-2xl shadow-black/60'
                : drag !== null && 'transition-transform duration-150',
            )}
          >
            {renderItem(key, { onPointerDown: start(i), style: { touchAction: 'none' }, 'aria-label': 'Déplacer' }, dragging)}
          </div>
        );
      })}
    </div>
  );
}
