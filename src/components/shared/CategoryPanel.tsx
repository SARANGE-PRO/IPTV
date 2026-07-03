'use client';

import { useState } from 'react';
import { IconEyeOff, IconX } from '@/components/ui/icons';
import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/cn';
import { useFilterStore } from '@/stores/filterStore';
import type { Category, Section } from '@/types/models';
import { normalizeText } from '@/utils/text';

interface CategoryPanelProps {
  open: boolean;
  onClose: () => void;
  categories: Category[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  section: Section;
}

/** Panneau lateral de choix de categorie, avec filtre local et masquage. */
export function CategoryPanel({ open, onClose, categories, selectedId, onSelect, section }: CategoryPanelProps) {
  const hideCategory = useFilterStore((s) => s.hideCategory);
  const [filter, setFilter] = useState('');

  if (!open) return null;

  const nf = normalizeText(filter);
  const shown = nf === '' ? categories : categories.filter((c) => c.normalizedName.includes(nf));

  return (
    <div className="fixed inset-0 z-50">
      <button aria-label="Fermer" className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="absolute inset-y-0 right-0 flex w-full max-w-sm animate-fade-in flex-col bg-ink-900 shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-ink-700 px-4 py-4 pt-safe">
          <h2 className="text-sm font-semibold text-fg">Catégories ({categories.length})</h2>
          <button onClick={onClose} aria-label="Fermer" className="rounded-full p-1.5 text-fg-muted hover:text-fg">
            <IconX />
          </button>
        </div>
        <div className="border-b border-ink-700 px-4 py-3">
          <Input
            placeholder="Filtrer les catégories…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
        </div>
        <div className="flex-1 overflow-y-auto p-2 pb-safe">
          {shown.map((c) => (
            <div
              key={c.id}
              className={cn(
                'group flex items-center gap-1 rounded-xl px-3 py-2.5',
                c.id === selectedId ? 'bg-ink-700' : 'hover:bg-ink-800',
              )}
            >
              <button
                className="flex-1 truncate text-left text-sm text-fg"
                onClick={() => {
                  onSelect(c.id);
                  onClose();
                }}
              >
                {c.isFrench === 1 && (
                  <span className="mr-1.5 rounded bg-accent/15 px-1 py-0.5 text-[10px] font-semibold text-accent">
                    FR
                  </span>
                )}
                {c.name}
              </button>
              <button
                title="Masquer cette catégorie"
                aria-label={`Masquer ${c.name}`}
                onClick={() => void hideCategory(section, c.id, c.name)}
                className="shrink-0 rounded p-1.5 text-fg-faint opacity-60 hover:text-accent hover:opacity-100"
              >
                <IconEyeOff className="h-4 w-4" />
              </button>
            </div>
          ))}
          {shown.length === 0 && (
            <p className="px-3 py-6 text-center text-xs text-fg-faint">Aucune catégorie ne correspond.</p>
          )}
        </div>
      </div>
    </div>
  );
}
