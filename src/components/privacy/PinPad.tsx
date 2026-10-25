'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';
import type { UnlockResult } from '@/services/privacy/privateModeService';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'] as const;

/**
 * Pave de code a 4 chiffres (grandes touches au pouce). Aucun libelle ne dit
 * a quoi il sert : seulement « Code ». Erreur = vibration visuelle, saisie
 * videe ; trop d'erreurs = attente affichee.
 */
export function PinPad({
  onSubmit,
  lockedUntil,
  onClose,
}: {
  onSubmit: (pin: string) => UnlockResult;
  lockedUntil: () => number;
  onClose: () => void;
}) {
  const [pin, setPin] = useState('');
  const [shake, setShake] = useState(false);
  const [wait, setWait] = useState(() => lockedUntil());
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (wait === 0) return;
    const id = setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= wait) setWait(0);
    }, 500);
    return () => clearInterval(id);
  }, [wait]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const press = (key: string) => {
    if (wait > 0 || key === '') return;
    if (key === '⌫') {
      setPin((p) => p.slice(0, -1));
      return;
    }
    const next = (pin + key).slice(0, 4);
    setPin(next);
    if (next.length < 4) return;
    const result = onSubmit(next);
    if (result === 'ok') return;
    setShake(true);
    setTimeout(() => {
      setShake(false);
      setPin('');
    }, 400);
    if (result === 'locked') setWait(lockedUntil());
  };

  const seconds = wait > 0 ? Math.max(1, Math.ceil((wait - now) / 1000)) : 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Code"
      className="fixed inset-0 z-[95] flex flex-col items-center justify-center bg-black/85 px-6 backdrop-blur-md"
    >
      <p className="text-sm font-medium text-fg">Code</p>
      <div className={cn('mt-5 flex gap-4', shake && 'animate-shake')}>
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={cn('h-3.5 w-3.5 rounded-full border border-white/50', i < pin.length && 'border-white bg-white')}
          />
        ))}
      </div>
      <p className="mt-3 h-4 text-xs text-fg-muted" aria-live="polite">
        {seconds > 0 ? `Réessaie dans ${seconds} s` : ''}
      </p>
      <div className="mt-6 grid grid-cols-3 gap-4">
        {KEYS.map((key, i) =>
          key === '' ? (
            <span key={i} />
          ) : (
            <button
              key={i}
              type="button"
              disabled={seconds > 0}
              aria-label={key === '⌫' ? 'Effacer' : key}
              onClick={() => press(key)}
              className="grid h-[4.5rem] w-[4.5rem] place-items-center rounded-full bg-white/10 text-2xl font-medium text-fg transition-colors active:bg-white/25 disabled:opacity-40"
            >
              {key}
            </button>
          ),
        )}
      </div>
      <button type="button" onClick={onClose} className="mt-8 h-11 px-4 text-sm text-fg-muted hover:text-fg">
        Annuler
      </button>
    </div>
  );
}
