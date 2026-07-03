import type { ReactNode } from 'react';
import { HScroll } from '@/components/shared/HScroll';

/** Rangee horizontale scrollable (accueil) — molette horizontale sur PC. */
export function Rail({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center justify-between px-1">
        <h2 className="text-sm font-semibold tracking-tight text-fg">{title}</h2>
        {action}
      </div>
      <HScroll className="flex gap-3 pb-2 [-webkit-overflow-scrolling:touch] [scrollbar-width:none]">
        {children}
      </HScroll>
    </section>
  );
}
