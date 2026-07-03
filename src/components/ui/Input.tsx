import { forwardRef, type InputHTMLAttributes, useId } from 'react';
import { cn } from '@/lib/cn';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

/** Champ texte premium. text-base (16px) : evite le zoom auto d'iOS au focus. */
export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, id, className, ...props }, ref) => {
    const autoId = useId();
    const inputId = id ?? autoId;
    return (
      <div className="space-y-1.5">
        {label !== undefined && (
          <label htmlFor={inputId} className="block text-sm font-medium text-fg-muted">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            'h-12 w-full rounded-xl border border-ink-600 bg-ink-800 px-4 text-base text-fg',
            'placeholder:text-fg-faint outline-none transition-colors',
            'focus:border-accent/70 focus:ring-2 focus:ring-accent/40',
            className,
          )}
          {...props}
        />
      </div>
    );
  },
);
Input.displayName = 'Input';
