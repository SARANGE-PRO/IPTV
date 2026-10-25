'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type TouchEvent } from 'react';
import { FavoriteButton } from '@/components/shared/FavoriteButton';
import { PosterImage } from '@/components/shared/PosterImage';
import { IconPlay } from '@/components/ui/icons';
import { cn } from '@/lib/cn';
import type { BillboardItem } from '@/services/home/homeRailsService';
import { movieHref, seriesHref } from '@/utils/appRoutes';
import { variantBadge } from '@/utils/variantPreference';
import { useLowBandwidth } from '@/hooks/useLowBandwidth';

/**
 * BILLBOARD d'accueil facon Netflix : image de fond plein cadre, titre,
 * meta (annee · note · genres), synopsis court, pastille de langue,
 * « Lecture » (lance directement), « Plus d'infos » (fiche), « Ma liste ».
 * Rotation douce entre 6 titres max, points cliquables, glisser au doigt.
 * Hauteur fixe par breakpoint : aucun saut de mise en page.
 *
 * `size` : « hero » sur l'accueil ; « compact » en tete de Films / Series
 * (memes possibilites, plus de place pour le catalogue).
 */
export type BillboardSize = 'hero' | 'compact';

const FRAME: Record<BillboardSize, string> = {
  hero: 'h-[50vh] max-h-[520px] min-h-[340px] md:h-[460px]',
  compact: 'h-[36vh] max-h-[340px] min-h-[260px] md:h-[320px]',
};
const FRAME_BASE = 'relative -mx-4 overflow-hidden bg-ink-900 md:mx-0 md:rounded-3xl';

/** Place reservee (meme gabarit) tant que le bandeau n'est pas calcule. */
export function BillboardPlaceholder({ size = 'hero' }: { size?: BillboardSize }) {
  return <div aria-hidden className={cn(FRAME_BASE, FRAME[size], 'animate-pulse')} />;
}

const ROTATE_MS = 9000;

function hrefs(item: BillboardItem): { play: string; info: string } {
  return item.type === 'vod'
    ? { play: movieHref(item.id, '', { play: true }), info: movieHref(item.id) }
    : { play: seriesHref(item.id, '', { play: true }), info: seriesHref(item.id) };
}

export function Billboard({ items, size = 'hero' }: { items: BillboardItem[]; size?: BillboardSize }) {
  const compact = size === 'compact';
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    setIndex(0);
  }, [items]);

  // Swipe horizontal : titre precedent / suivant (et la rotation s'arrete).
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: TouchEvent) => {
    const t = e.touches[0];
    swipe.current = t !== undefined ? { x: t.clientX, y: t.clientY } : null;
    setPaused(true);
  };
  const onTouchEnd = (e: TouchEvent) => {
    const start = swipe.current;
    const t = e.changedTouches[0];
    swipe.current = null;
    if (start === null || t === undefined || items.length <= 1) return;
    const dx = t.clientX - start.x;
    if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(t.clientY - start.y) * 1.5) return;
    setIndex((i) => (i + (dx < 0 ? 1 : items.length - 1)) % items.length);
  };

  // Connexion faible : pas de rotation (chaque fond = 150 a 400 Ko).
  const { enabled: lowBandwidth } = useLowBandwidth();
  useEffect(() => {
    if (items.length <= 1 || paused || lowBandwidth) return;
    const id = window.setInterval(() => setIndex((i) => (i + 1) % items.length), ROTATE_MS);
    return () => window.clearInterval(id);
  }, [items.length, paused, lowBandwidth]);

  const item = items[index] ?? items[0];
  if (item === undefined) return null;
  const { play, info } = hrefs(item);
  const badge = variantBadge(item.variant, item.variantSource);
  const meta = [
    item.year !== null ? String(item.year) : null,
    item.rating !== null && item.rating > 0 ? `★ ${item.rating.toFixed(1)}` : null,
    ...item.genres,
  ].filter((v): v is string => v !== null);

  return (
    <section
      aria-roledescription="carrousel"
      aria-label="À la une"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      // Au doigt : la rotation s'arrete (le titre ne change plus sous le tap).
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      className={cn(FRAME_BASE, FRAME[size])}
    >
      <PosterImage
        key={item.key}
        src={item.backdrop ?? item.poster}
        alt=""
        className={cn('absolute inset-0 h-full w-full animate-fade-in', item.backdrop === null && 'scale-110 blur-sm')}
      />
      {/* Fondus : lisibilite du texte + raccord avec le fond de page. */}
      <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/40 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-r from-ink-950/80 via-ink-950/20 to-transparent" />

      <div className={cn('absolute inset-x-0 bottom-0 px-5 md:px-10', compact ? 'pb-5 md:pb-8' : 'pb-6 md:pb-10')}>
        <div key={item.key} className="max-w-xl animate-fade-in">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-accent">
              {/* Onglet deja « Films » / « Series » : le type serait redondant. */}
              {compact ? 'À la une' : item.type === 'vod' ? 'Film' : 'Série'}
            </span>
            {badge !== null && (
              <span className="rounded bg-white/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white backdrop-blur-sm">
                {badge}
              </span>
            )}
          </div>
          <h2
            className={cn(
              'mt-2 line-clamp-2 font-bold leading-tight tracking-tight text-fg drop-shadow-lg',
              compact ? 'text-2xl md:text-4xl' : 'text-3xl md:text-5xl',
            )}
          >
            {item.title}
          </h2>
          {meta.length > 0 && <p className="mt-2 text-xs font-medium text-fg-muted md:text-sm">{meta.join(' · ')}</p>}
          {item.overview !== null && (
            <p
              className={cn(
                'line-clamp-2 leading-relaxed text-fg/85',
                compact ? 'mt-2 text-[13px] md:text-sm' : 'mt-3 text-sm md:line-clamp-3 md:text-base',
              )}
            >
              {item.overview}
            </p>
          )}
          <div className={cn('flex items-center gap-3', compact ? 'mt-4' : 'mt-5')}>
            <Link
              href={play}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-white px-6 text-[15px] font-semibold text-black transition-colors hover:bg-white/85 active:scale-[0.98]"
            >
              <IconPlay className="h-5 w-5" />
              Lecture
            </Link>
            <Link
              href={info}
              className="inline-flex h-11 items-center rounded-xl bg-white/20 px-5 text-[15px] font-semibold text-white backdrop-blur-md transition-colors hover:bg-white/30"
            >
              Plus d’infos
            </Link>
            <FavoriteButton type={item.type} itemId={item.id} className="h-11 w-11 bg-white/20 p-0 [&>svg]:mx-auto" />
          </div>
        </div>
      </div>

      {items.length > 1 && (
        <div className="absolute right-3 top-2 flex md:right-6 md:top-5">
          {items.map((b, i) => (
            // Zone de tap genereuse autour d'un point fin.
            <button
              key={b.key}
              type="button"
              aria-label={`Afficher ${b.title}`}
              aria-current={i === index}
              onClick={() => {
                setPaused(true);
                setIndex(i);
              }}
              className="grid h-11 min-w-[1.75rem] place-items-center px-1"
            >
              <span className={cn('h-1.5 rounded-full transition-all', i === index ? 'w-6 bg-white' : 'w-1.5 bg-white/45')} />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
