import { cn } from '@/lib/cn';

/** Bloc squelette pour les etats de chargement. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-lg bg-ink-700/60', className)} />;
}
