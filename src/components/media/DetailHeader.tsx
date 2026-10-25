'use client';

import { ArrangeButton } from '@/components/favorites/ArrangeButton';
import { CastButton } from '@/components/player/CastButton';
import { PipButton } from '@/components/player/PipButton';
import { FavoriteButton } from '@/components/shared/FavoriteButton';
import { IconArrowLeft } from '@/components/ui/icons';

/**
 * En-tete COLLANT des fiches film/serie : retour, titre, puis actions du
 * lecteur en groupe serre (le titre garde de la place sur iPhone) — image dans
 * l'image, diffuser sur la TV, ranger, favori.
 */
export function DetailHeader({
  type,
  itemId,
  title,
  onBack,
  video,
  castUrl,
  castTitle,
}: {
  type: 'vod' | 'series';
  itemId: string;
  title: string;
  onBack: () => void;
  /** <video> du lecteur unique quand CE titre joue ici (PiP), sinon null. */
  video: HTMLVideoElement | null;
  /** Flux a diffuser (celui qui joue, sinon celui que « Lecture » lancerait). */
  castUrl: string | null;
  castTitle: string;
}) {
  return (
    <div className="sticky top-safe z-20 -mx-4 mb-2 flex items-center gap-2 bg-ink-950/75 px-4 py-2 backdrop-blur-md md:-mx-8 md:px-8">
      <button
        type="button"
        onClick={onBack}
        aria-label="Retour"
        className="glass grid h-11 w-11 shrink-0 place-items-center rounded-full text-fg-muted transition-colors hover:text-fg"
      >
        <IconArrowLeft className="h-5 w-5" />
      </button>
      <h1 className="min-w-0 flex-1 truncate text-lg font-semibold text-fg drop-shadow">{title}</h1>
      <div className="flex shrink-0 items-center gap-0.5">
        <PipButton video={video} className="h-10 w-10" />
        <CastButton className="h-10 w-10" streamUrl={castUrl} title={castTitle} />
        <ArrangeButton className="h-10 w-10" type={type} itemId={itemId} title={title} />
        <FavoriteButton className="h-10 w-10" type={type} itemId={itemId} title={title} />
      </div>
    </div>
  );
}
