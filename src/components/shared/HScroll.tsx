'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Conteneur a defilement horizontal. Sur mobile c'est tactile ; sur PC (pas de
 * scrollbar visible) on convertit la molette verticale en defilement horizontal
 * pour que les rangees qui debordent (chips de filtres, rails) restent
 * accessibles a la souris.
 */
export function HScroll({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (el === null) return;
    const onWheel = (event: WheelEvent) => {
      // Geste deja horizontal (trackpad) : laisser faire.
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      // Rien a defiler horizontalement : laisser le scroll vertical de la page.
      if (el.scrollWidth <= el.clientWidth) return;
      el.scrollLeft += event.deltaY;
      event.preventDefault();
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  return (
    <div ref={ref} className={cn('overflow-x-auto', className)}>
      {children}
    </div>
  );
}
