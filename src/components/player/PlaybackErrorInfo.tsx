'use client';

import { useState } from 'react';
import {
  buildPlaybackDiagnostic,
  formatPlaybackDiagnostic,
} from '@/services/diagnostics/playbackDiagnosticService';
import type { PlaybackContext, PlaybackFailure } from '@/types/playbackDiagnostics';

/**
 * Bouton (i) discret sur l'ecran d'erreur du lecteur : genere A LA DEMANDE un
 * diagnostic precis et copiable (anonymise, sans URL ni identifiants).
 * N'influe pas sur l'experience : rien ne se charge tant qu'on ne l'ouvre pas.
 */
export function PlaybackErrorInfo({
  failure,
  context,
}: {
  failure: PlaybackFailure;
  context: PlaybackContext;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const toggle = async () => {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (text === null) {
      const diag = await buildPlaybackDiagnostic(failure, context);
      setText(formatPlaybackDiagnostic(diag));
    }
  };

  const copy = async () => {
    if (text === null) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard indispo : le bloc reste selectionnable manuellement.
    }
  };

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={() => void toggle()}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 text-xs text-fg-faint underline-offset-2 hover:text-fg-muted hover:underline"
      >
        <span
          aria-hidden
          className="grid h-4 w-4 place-items-center rounded-full border border-current text-[10px] font-semibold leading-none"
        >
          i
        </span>
        Diagnostic
      </button>

      {open && (
        <div className="mt-3 w-full text-left">
          <pre className="max-h-52 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-ink-600 bg-ink-950/80 p-3 text-left text-[11px] leading-relaxed text-fg-muted">
            {text ?? 'Analyse…'}
          </pre>
          <button
            type="button"
            onClick={() => void copy()}
            disabled={text === null}
            className="mt-2 rounded-lg bg-ink-700 px-3 py-1.5 text-xs font-medium text-fg transition-colors hover:bg-ink-600 disabled:opacity-40"
          >
            {copied ? 'Copié ✓' : 'Copier le diagnostic'}
          </button>
        </div>
      )}
    </div>
  );
}
