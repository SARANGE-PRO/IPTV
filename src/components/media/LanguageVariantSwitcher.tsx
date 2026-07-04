'use client';

import { cn } from '@/lib/cn';
import { VARIANT_LABEL, type LanguageVariant } from '@/services/media/languageVariantService';

/**
 * Selecteur de VARIANTE DE LANGUE (VF / MULTI / VOSTFR / VO). Le provider livre
 * une entree par langue : changer de variante change le flux lu. Affiche la
 * qualite si elle differe d'une variante a l'autre (info utile, "different
 * qualite"). Masque si une seule variante (rien a choisir).
 */
export function LanguageVariantSwitcher({
  variants,
  activeId,
  onSelect,
}: {
  variants: LanguageVariant[];
  activeId: string;
  onSelect: (variant: LanguageVariant) => void;
}) {
  if (variants.length < 2) return null;
  const showQuality = new Set(variants.map((v) => v.qualityLabel)).size > 1;

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] font-medium uppercase tracking-wide text-fg-faint">Version</span>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Choix de la version linguistique">
        {variants.map((v) => {
          const active = v.id === activeId;
          return (
            <button
              key={v.id}
              type="button"
              aria-pressed={active}
              onClick={() => onSelect(v)}
              className={cn(
                'rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
                active ? 'bg-accent text-white' : 'bg-ink-700 text-fg-muted hover:bg-ink-600 hover:text-fg',
              )}
            >
              {VARIANT_LABEL[v.tag]}
              {showQuality && <span className="ml-1 font-normal opacity-70">{v.qualityLabel}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
