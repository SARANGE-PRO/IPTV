import clsx, { type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Fusionne des classes conditionnelles (clsx) puis resout les conflits
 * d'utilitaires Tailwind (tailwind-merge). Helper utilise par tous les
 * composants UI.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
