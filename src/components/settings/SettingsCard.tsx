import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Briques de la page Reglages : carte titree, ligne « libelle + aide | controle »
 * et interrupteur. Composants de presentation purs.
 */

export function SettingsCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-ink-800 p-5">
      <h2 className="text-sm font-semibold text-fg">{title}</h2>
      {description !== undefined && <p className="mt-1 text-xs leading-relaxed text-fg-muted">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function SettingsRow({
  label,
  hint,
  children,
  stacked = false,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  /** Controle sous le libelle (listes deroulantes pleine largeur). */
  stacked?: boolean;
}) {
  return (
    <div className={cn('flex gap-3', stacked ? 'flex-col gap-1.5' : 'items-center justify-between')}>
      <span className="min-w-0">
        <span className="block text-sm text-fg">{label}</span>
        {hint !== undefined && <span className="mt-0.5 block text-[11px] leading-relaxed text-fg-faint">{hint}</span>}
      </span>
      {children}
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Nom accessible (le libelle visible est a cote). */
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-7 w-12 shrink-0 rounded-full p-0 transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
        checked ? 'bg-accent' : 'bg-ink-600',
      )}
    >
      <span
        className={cn(
          'absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-5' : 'translate-x-0',
        )}
      />
    </button>
  );
}

export function StatusLine({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'ok' | 'warn' }) {
  return (
    <p
      role="status"
      className={cn(
        'mt-3 text-xs',
        tone === 'ok' ? 'text-emerald-400' : tone === 'warn' ? 'text-amber-300' : 'text-fg-muted',
      )}
    >
      {children}
    </p>
  );
}
