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
  const [copyState, setCopyState] = useState<'idle' | 'ok' | 'manual'>('idle');

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

  const flashOk = () => {
    setCopyState('ok');
    setTimeout(() => setCopyState('idle'), 1800);
  };

  const copy = async () => {
    if (text === null) return;
    // 1) API moderne (HTTPS + geste utilisateur).
    if (navigator.clipboard?.writeText !== undefined) {
      try {
        await navigator.clipboard.writeText(text);
        flashOk();
        return;
      } catch {
        // indispo (contexte non securise / permission) -> fallback
      }
    }
    // 2) Fallback legacy execCommand (vieux WebView, page http://LAN).
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      if (ok) {
        flashOk();
        return;
      }
    } catch {
      // ignore -> invite a copier manuellement
    }
    // 3) Echec total : le bloc reste selectionnable, on l'indique.
    setCopyState('manual');
    setTimeout(() => setCopyState('idle'), 4000);
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
            {copyState === 'ok' ? 'Copié ✓' : 'Copier le diagnostic'}
          </button>
          {copyState === 'manual' && (
            <p className="mt-1.5 text-[11px] text-fg-faint">
              Copie automatique indisponible — sélectionne le texte ci-dessus et copie-le manuellement.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
