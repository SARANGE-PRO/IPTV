'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';

/**
 * Texte replie a quelques lignes avec « Plus » / « Moins » — le bouton
 * n'apparait que si le texte deborde reellement.
 */
export function ClampedText({ text, className }: { text: string; className?: string }) {
  const ref = useRef<HTMLParagraphElement | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (el === null || expanded) return;
    setOverflows(el.scrollHeight > el.clientHeight + 1);
  }, [text, expanded]);

  return (
    <div className={className}>
      <p ref={ref} className={cn('text-sm leading-relaxed text-fg-muted', !expanded && 'line-clamp-4')}>
        {text}
      </p>
      {(overflows || expanded) && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="-ml-2 px-2 py-2.5 text-xs font-semibold text-fg hover:underline"
        >
          {expanded ? 'Moins' : 'Plus'}
        </button>
      )}
    </div>
  );
}
