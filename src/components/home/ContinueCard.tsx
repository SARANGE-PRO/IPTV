'use client';

import Link from 'next/link';
import { PosterImage } from '@/components/shared/PosterImage';
import { IconPlay, IconX } from '@/components/ui/icons';
import type { ContinueItem } from '@/services/home/continueWatchingService';

/**
 * Carte PAYSAGE de « Continuer a regarder » : still / backdrop, barre de
 * progression, titre + « S2 · E4 · Reste 12 min ». Le tap relance la lecture ;
 * la croix retire la carte (progression conservee).
 */
export function ContinueCard({ item, onDismiss }: { item: ContinueItem; onDismiss: () => void }) {
  return (
    <div className="group relative w-60 shrink-0 sm:w-64">
      <Link
        href={item.href}
        className="block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-ink-950"
      >
        <div className="relative overflow-hidden rounded-xl border border-white/[0.06] bg-ink-800 shadow-lg shadow-black/40">
          <PosterImage
            src={item.image ?? item.fallbackImage}
            fallbackSrc={item.fallbackImage}
            alt={item.title}
            className="aspect-video w-full transition-transform duration-500 group-hover:scale-105"
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
          <span className="pointer-events-none absolute inset-0 m-auto grid h-11 w-11 place-items-center rounded-full bg-black/55 ring-1 ring-white/30 backdrop-blur-sm">
            <IconPlay className="ml-0.5 h-5 w-5 text-white" />
          </span>
          {item.kind === 'next' && (
            <span className="absolute left-2 top-2 rounded bg-accent px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">
              Nouvel épisode
            </span>
          )}
          {item.progress !== null && item.progress > 0 && (
            <div className="absolute inset-x-0 bottom-0 h-1 bg-white/20">
              <div className="h-full bg-accent" style={{ width: `${Math.min(item.progress * 100, 100)}%` }} />
            </div>
          )}
        </div>
        <p className="mt-1.5 truncate text-[13px] font-medium text-fg">{item.title}</p>
        <p className="truncate text-[11px] text-fg-faint">{item.subtitle}</p>
      </Link>
      <button
        type="button"
        aria-label={`Retirer ${item.title} de Continuer à regarder`}
        onClick={onDismiss}
        className="hit-44 absolute right-1.5 top-1.5 grid h-8 w-8 place-items-center rounded-full bg-black/60 text-white/80 backdrop-blur-sm transition-opacity hover:text-white [@media(hover:hover)]:md:opacity-0 [@media(hover:hover)]:md:group-hover:opacity-100"
      >
        <IconX className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
