import { cn } from '@/lib/cn';
import { colorFromString, initials } from '@/utils/monogram';

/** Pastille d'initiales — fallback premium quand aucune image n'est disponible. */
export function Monogram({ name, className }: { name: string; className?: string }) {
  return (
    <div
      className={cn('flex items-center justify-center font-semibold text-white/90', className)}
      style={{ backgroundColor: colorFromString(name) }}
      aria-hidden
    >
      <span className="text-[0.9em] tracking-wide">{initials(name)}</span>
    </div>
  );
}
