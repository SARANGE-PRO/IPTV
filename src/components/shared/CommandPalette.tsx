'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { IconFilm, IconSeries, IconTv } from '@/components/ui/icons';
import { cn } from '@/lib/cn';
import * as catalogService from '@/services/data/catalogService';
import { useDebounce } from '@/hooks/useDebounce';
import { useFilterStore } from '@/stores/filterStore';
import { displayChannelName, displayTitle } from '@/utils/displayTitle';

/**
 * Palette de commandes universelle (Cmd/Ctrl+K) : recherche instantanee
 * chaines + films + series, navigation 100% clavier. Montee globalement par
 * AppShell. Reutilise l'index Dexie (jamais de scan complet).
 */
type Kind = 'live' | 'movie' | 'series';
interface Hit {
  kind: Kind;
  id: string;
  title: string;
  subtitle: string | null;
}

const KIND_ICON = { live: IconTv, movie: IconFilm, series: IconSeries } as const;
const hrefFor = (h: Hit): string =>
  h.kind === 'live' ? `/live/${h.id}` : h.kind === 'movie' ? `/movies/${h.id}` : `/series/${h.id}`;

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const debounced = useDebounce(query.trim(), 200);
  const hiddenLive = useFilterStore((s) => s.hidden.live);
  const hiddenVod = useFilterStore((s) => s.hidden.vod);
  const hiddenSeries = useFilterStore((s) => s.hidden.series);

  // Raccourci global d'ouverture (Cmd/Ctrl+K).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('zib:command', onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('zib:command', onOpen);
    };
  }, []);

  // Focus + reset a l'ouverture, verrou de scroll.
  useEffect(() => {
    if (!open) {
      setQuery('');
      setHits([]);
      setActive(0);
      return;
    }
    const t = setTimeout(() => inputRef.current?.focus(), 20);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      clearTimeout(t);
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Recherche debouncee, tous types confondus.
  useEffect(() => {
    if (debounced.length < 2) {
      setHits([]);
      return;
    }
    let alive = true;
    void Promise.all([
      catalogService.searchLiveChannels(debounced, 6, hiddenLive),
      catalogService.searchMovies(debounced, 6, hiddenVod),
      catalogService.searchSeries(debounced, 6, hiddenSeries),
    ]).then(([live, movies, series]) => {
      if (!alive) return;
      const next: Hit[] = [
        ...live.map((c) => ({ kind: 'live' as const, id: c.id, title: displayChannelName(c.name), subtitle: 'Live' })),
        ...movies.map((m) => ({ kind: 'movie' as const, id: m.id, title: displayTitle(m.name), subtitle: 'Film' })),
        ...series.map((s) => ({ kind: 'series' as const, id: s.id, title: displayTitle(s.name), subtitle: 'Série' })),
      ];
      setHits(next);
      setActive(0);
    });
    return () => {
      alive = false;
    };
  }, [debounced, hiddenLive, hiddenVod, hiddenSeries]);

  const go = (hit: Hit | undefined) => {
    if (hit === undefined) return;
    setOpen(false);
    router.push(hrefFor(hit));
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') setOpen(false);
    else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, hits.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      go(hits[active]);
    }
  };

  const empty = useMemo(() => debounced.length >= 2 && hits.length === 0, [debounced, hits]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={() => setOpen(false)}
      className="fixed inset-0 z-[60] animate-fade-in bg-black/70 px-4 pt-[12vh] backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="mx-auto w-full max-w-xl animate-modal-rise overflow-hidden rounded-2xl border border-ink-700/70 bg-ink-900 shadow-2xl shadow-black/60"
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          enterKeyHint="search"
          placeholder="Rechercher une chaîne, un film, une série…"
          className="w-full border-b border-ink-700 bg-transparent px-4 py-3.5 text-base text-fg outline-none placeholder:text-fg-faint"
        />
        <div className="max-h-[50vh] overflow-y-auto py-1">
          {hits.map((h, i) => {
            const Icon = KIND_ICON[h.kind];
            return (
              <button
                key={`${h.kind}:${h.id}`}
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => go(h)}
                className={cn(
                  'flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors',
                  i === active ? 'bg-ink-700' : 'hover:bg-ink-800',
                )}
              >
                <Icon className="h-4 w-4 shrink-0 text-fg-faint" />
                <span className="min-w-0 flex-1 truncate text-sm text-fg">{h.title}</span>
                <span className="shrink-0 text-[11px] text-fg-faint">{h.subtitle}</span>
              </button>
            );
          })}
          {empty && <p className="px-4 py-6 text-center text-sm text-fg-faint">Aucun résultat.</p>}
          {debounced.length < 2 && (
            <p className="px-4 py-6 text-center text-xs text-fg-faint">
              Tape au moins 2 lettres · <kbd className="rounded bg-ink-700 px-1.5 py-0.5">Échap</kbd> pour fermer
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
