'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { PosterImage } from '@/components/shared/PosterImage';
import { Button } from '@/components/ui/Button';
import { IconPlay } from '@/components/ui/icons';
import * as catalogRepository from '@/services/data/catalogService';
import { detectFrenchVariant } from '@/services/media/languageDetectionService';
import type { Section } from '@/types/models';
import { displayTitle, displayYear } from '@/utils/displayTitle';

/**
 * Hero editorial (facon Netflix) en tete de catalogue : met en avant un contenu
 * FR recent. Hauteur fixe (aucun layout shift), donnees bornees (jamais de scan
 * global, aucun appel TMDB). Rien ne s'affiche tant qu'aucun candidat fiable.
 */

interface HeroItem {
  id: string;
  title: string;
  subtitle: string | null;
  image: string | null;
  tag: string | null;
}

export function CatalogHero({ section }: { section: Extract<Section, 'vod' | 'series'> }) {
  const [item, setItem] = useState<HeroItem | null>(null);

  useEffect(() => {
    let active = true;
    const load = async (): Promise<void> => {
      if (section === 'vod') {
        const rows = await catalogRepository.getFrenchMovies(12, 'recent');
        const pick = rows.find((m) => m.posterUrl !== null) ?? rows[0];
        if (pick !== undefined && active) {
          setItem({
            id: pick.id,
            title: displayTitle(pick.name),
            subtitle: [
              displayYear(pick.name, pick.year)?.toString() ?? null,
              pick.rating !== null ? `★ ${pick.rating.toFixed(1)}` : null,
            ]
              .filter((v): v is string => v !== null)
              .join(' · ') || null,
            image: pick.posterUrl,
            tag: detectFrenchVariant(pick.name),
          });
        }
      } else {
        const rows = await catalogRepository.getFrenchSeries(12, 'recent');
        const pick = rows.find((s) => s.backdropUrl !== null || s.posterUrl !== null) ?? rows[0];
        if (pick !== undefined && active) {
          setItem({
            id: pick.id,
            title: displayTitle(pick.name),
            subtitle: [
              pick.releaseDate?.slice(0, 4) ?? null,
              pick.rating !== null ? `★ ${pick.rating.toFixed(1)}` : null,
            ]
              .filter((v): v is string => v !== null)
              .join(' · ') || null,
            image: pick.backdropUrl ?? pick.posterUrl,
            tag: detectFrenchVariant(pick.name),
          });
        }
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [section]);

  if (item === null) return null;
  const href = `/${section === 'vod' ? 'movies' : 'series'}/${item.id}`;

  return (
    <section className="relative mt-4 h-44 overflow-hidden rounded-2xl bg-ink-800 sm:h-56 md:h-64">
      <PosterImage src={item.image} alt={item.title} className="absolute inset-0 h-full w-full" />
      <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/60 to-transparent" />
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
              Voir
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}
