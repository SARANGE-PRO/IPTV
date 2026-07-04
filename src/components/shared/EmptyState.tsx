import type { ReactNode } from 'react';

/**
 * Etat vide soigne : pastille decorative (lueur accent discrete) + titre + hint
 * + action optionnelle. Icone personnalisable, sinon glyphe par defaut sobre.
 */
export function EmptyState({
  title,
  hint,
  action,
  icon,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex animate-fade-in flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-ink-600 bg-ink-900/40 px-6 py-14 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-full bg-ink-800 text-fg-faint ring-1 ring-white/[0.06] shadow-[0_0_24px_-6px_rgba(229,9,20,0.35)]">
        {icon ?? (
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden>
            <path
              d="M4 7a2 2 0 0 1 2-2h5l2 2h5a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7Z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </div>
      <p className="text-sm font-semibold text-fg">{title}</p>
      {hint !== undefined && <p className="max-w-sm text-xs leading-relaxed text-fg-muted">{hint}</p>}
      {action !== undefined && <div className="mt-2">{action}</div>}
    </div>
  );
}
