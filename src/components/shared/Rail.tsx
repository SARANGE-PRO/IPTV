import type { ReactNode } from 'react';
import { HScroll } from '@/components/shared/HScroll';

/** Rangee horizontale scrollable (accueil) — molette horizontale sur PC. */
export function Rail({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center justify-between gap-3 px-1">
        <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight text-fg">
          <span className="h-4 w-1 rounded-full bg-accent" aria-hidden />
          {title}
        </h2>
        {action !== undefined && <div className="shrink-0">{action}</div>}
      </div>
      <HScroll className="flex gap-3 pb-2 [-webkit-overflow-scrolling:touch] [scrollbar-width:none]">
        {children}
      </HScroll>
    </section>
  );
}
