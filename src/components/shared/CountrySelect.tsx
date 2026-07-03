'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/cn';

const COUNTRY_NAMES: Record<string, string> = {
  ALL: 'Tous les pays',
  FR: 'France',
  BE: 'Belgique',
  CH: 'Suisse',
  CA: 'Canada',
  GB: 'Royaume-Uni',
  US: 'États-Unis',
  ES: 'Espagne',
  DE: 'Allemagne',
  IT: 'Italie',
  TR: 'Turquie',
  PT: 'Portugal',
  BR: 'Brésil',
  NL: 'Pays-Bas',
  PL: 'Pologne',
  RU: 'Russie',
  IN: 'Inde',
  PK: 'Pakistan',
  MA: 'Maroc',
  DZ: 'Algérie',
  TN: 'Tunisie',
  RO: 'Roumanie',
  AL: 'Albanie',
  GR: 'Grèce',
};

/** Selecteur de pays : priorise sans jamais masquer les autres pays. */
export function CountrySelect({
  value,
  countries,
  onChange,
  className,
}: {
  value: string;
  countries: string[];
  onChange: (country: string) => void;
  className?: string;
}) {
  const options = useMemo(() => {
    const set = new Set(countries);
    set.delete('FR');
    return ['FR', 'ALL', ...[...set].sort()];
  }, [countries]);

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Pays prioritaire"
      className={cn(
        'h-10 rounded-xl border border-ink-600 bg-ink-800 px-3 text-sm text-fg outline-none focus:border-accent/70',
        className,
      )}
    >
      {options.map((c) => (
        <option key={c} value={c}>
          {COUNTRY_NAMES[c] ?? c}
        </option>
      ))}
    </select>
  );
}
