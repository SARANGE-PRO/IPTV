import type { ReactNode } from 'react';

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-ink-600 px-6 py-14 text-center">
      <p className="text-sm font-medium text-fg">{title}</p>
      {hint !== undefined && <p className="max-w-sm text-xs leading-relaxed text-fg-muted">{hint}</p>}
      {action !== undefined && <div className="mt-3">{action}</div>}
    </div>
  );
}
