'use client';

import { useEffect, useRef, useState } from 'react';
import { TAB_NAME_MAX } from '@/services/favorites/favoriteTabsService';

const SUGGESTIONS = ['Sport', 'Info', 'Ciné', 'Enfants', 'Soirée'];

/** Saisie du nom d'un onglet (creation / renommage). */
export function TabNameDialog({
  title,
  initial = '',
  confirmLabel,
  onSubmit,
  onClose,
}: {
  title: string;
  initial?: string;
  confirmLabel: string;
  onSubmit: (name: string) => void | Promise<void>;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initial);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async () => {
    if (value.trim() === '') return;
    await onSubmit(value);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
      className="fixed inset-0 z-[80] flex animate-fade-in items-start justify-center bg-black/60 px-4 pt-[calc(env(safe-area-inset-top)+18vh)] backdrop-blur-sm"
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="w-full max-w-sm animate-modal-rise rounded-3xl border border-ink-700/70 bg-ink-900 p-5 shadow-2xl shadow-black/60"
      >
        <h2 className="text-base font-semibold text-fg">{title}</h2>
        <input
          ref={inputRef}
          value={value}
          maxLength={TAB_NAME_MAX}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Nom de l'onglet"
          enterKeyHint="done"
          className="mt-4 h-12 w-full rounded-xl border border-ink-600 bg-ink-800 px-3 text-base text-fg placeholder:text-fg-faint focus:border-accent/60 focus:outline-none"
        />
        {initial === '' && (
          <div className="mt-3 flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setValue(s)}
                className="rounded-full bg-ink-800 px-3 py-1 text-xs text-fg-muted hover:text-fg"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-11 rounded-xl bg-ink-700 text-sm font-medium text-fg hover:bg-ink-600"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={value.trim() === ''}
            className="h-11 rounded-xl bg-accent text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-40"
          >
            {confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
