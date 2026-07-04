'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { PosterImage } from '@/components/shared/PosterImage';
import { Button } from '@/components/ui/Button';
import { IconPlay } from '@/components/ui/icons';
import { detectFrenchVariant } from '@/services/media/languageDetectionService';
import { getMovieTop10, getSeriesTop10 } from '@/services/ranking/smartRankingService';
import type { Section } from '@/types/models';
import { displayTitle, displayYear } from '@/utils/displayTitle';

/**
 * Hero editorial (facon Netflix) en tete de catalogue : met en avant un contenu
 * SOLIDE (Top 10 curate : affiche + note credible + dedup), avec rotation douce
 * entre les meilleurs. Hauteur fixe (aucun layout shift), donnees bornees (aucun
 * scan global, aucun appel TMDB). Rien tant qu'aucun candidat fiable.
 */

interface HeroItem {
  id: string;
  title: string;
  subtitle: string | null;
  image: string | null;
  tag: string | null;
}

const ROTATE_MS = 7000;

export function CatalogHero({ section }: { section: Extract<Section, 'vod' | 'series'> }) {
  const [items, setItems] = useState<HeroItem[]>([]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    let active = true;
    const load = async (): Promise<void> => {
      const heroes: HeroItem[] =
        section === 'vod'
          ? (await getMovieTop10(8))
              .filter((m) => m.posterUrl !== null)
              .map((m) => ({
                id: m.id,
                title: displayTitle(m.name),
                subtitle:
                  [
                    displayYear(m.name, m.year)?.toString() ?? null,
                    m.rating !== null ? `★ ${m.rating.toFixed(1)}` : null,
                  ]
                    .filter((v): v is string => v !== null)
                    .join(' · ') || null,
                image: m.posterUrl,
                tag: detectFrenchVariant(m.name),
              }))
          : (await getSeriesTop10(8))
              .filter((s) => s.backdropUrl !== null || s.posterUrl !== null)
              .map((s) => ({
                id: s.id,
                title: displayTitle(s.name),
                subtitle:
                  [
                    s.releaseDate?.slice(0, 4) ?? null,
                    s.rating !== null ? `★ ${s.rating.toFixed(1)}` : null,
                  ]
                    .filter((v): v is string => v !== null)
                    .join(' · ') || null,
                image: s.backdropUrl ?? s.posterUrl,
                tag: detectFrenchVariant(s.name),
              }));
      if (active) {
        setItems(heroes.slice(0, 5));
        setIndex(0);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [section]);

  useEffect(() => {
    if (items.length <= 1) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % items.length), ROTATE_MS);
    return () => clearInterval(id);
  }, [items.length]);

  const item = items[index] ?? null;
  if (item === null) return null;
  const href = `/${section === 'vod' ? 'movies' : 'series'}/${item.id}`;

  return (
    <section className="relative mt-4 h-44 overflow-hidden rounded-2xl bg-ink-800 sm:h-56 md:h-64">
      <PosterImage
        key={item.id}
        src={item.image}
        alt={item.title}
        className="absolute inset-0 h-full w-full animate-fade-in"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/60 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-r from-ink-950/60 to-transparent" />
      {items.length > 1 && (
        <div className="absolute right-4 top-4 flex gap-1.5">
          {items.map((h, i) => (
            <span
              key={h.id}
              className={`h-1.5 rounded-full transition-all ${i === index ? 'w-5 bg-white' : 'w-1.5 bg-white/40'}`}
            />
          ))}
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 p-5">
        <div className="flex items-center gap-2">
          <span className="rounded bg-accent/90 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">
            À la une
          </span>
          {item.tag !== null && (
            <span className="rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">
              {item.tag}
            </span>
          )}
        </div>
        <h2 className="mt-2 line-clamp-1 text-xl font-semibold text-fg drop-shadow sm:text-2xl">{item.title}</h2>
        {item.subtitle !== null && <p className="text-xs text-fg-muted">{item.subtitle}</p>}
        <div className="mt-3">
          <Link href={href}>
            <Button size="sm">
              <IconPlay className="mr-2 h-4 w-4" />
              Regarder
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}
