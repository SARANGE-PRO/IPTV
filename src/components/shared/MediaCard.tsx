import Link from 'next/link';
import { FavoriteButton } from '@/components/shared/FavoriteButton';
import { PosterImage } from '@/components/shared/PosterImage';
import { cn } from '@/lib/cn';
import type { MediaType } from '@/types/models';

interface MediaCardProps {
  href: string;
  title: string;
  posterUrl: string | null;
  subtitle?: string | null;
  /** Badge libre en haut a gauche (ex. rang « #1 » du Top 10). */
  badge?: string;
  /** Pastille qualite (4K/FHD/HD) en haut a gauche — ignoree si `badge` present. */
  quality?: string | null;
  /** Note TMDB (0..10) — pastille ★ en bas a droite. */
  rating?: number | null;
  /** Pastille langue/variante (VF/VOSTFR/MULTI) en bas a gauche du poster. */
  tag?: string | null;
  /** Ratio 0..1 — barre de progression rouge sous le poster. */
  progress?: number | null;
  favorite?: { type: MediaType; itemId: string };
  className?: string;
}

export function MediaCard({
  href,
  title,
  posterUrl,
  subtitle,
  badge,
  quality,
  rating,
  tag,
  progress,
  favorite,
  className,
}: MediaCardProps) {
  return (
    <Link
      href={href}
      className={cn(
        'group block rounded-xl outline-none transition-transform duration-200 will-change-transform',
        'hover:-translate-y-1 active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-ink-950',
        className,
      )}
    >
      <div className="relative overflow-hidden rounded-xl border border-white/[0.06] shadow-lg shadow-black/40 transition-all duration-300 group-hover:border-accent/40 group-hover:shadow-[0_16px_44px_-12px_rgba(229,9,20,0.4)]">
        <PosterImage
          src={posterUrl}
          alt={title}
          className="aspect-[2/3] w-full transition-transform duration-500 group-hover:scale-105"
        />
        {/* Scrim bas : lisibilite des pastilles/badge. */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />

        {/* Play au survol (facon Apple TV). */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-300 group-hover:opacity-100">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-black/55 ring-1 ring-white/25 backdrop-blur-sm">
            <svg viewBox="0 0 24 24" className="ml-0.5 h-5 w-5 text-white" fill="currentColor" aria-hidden>
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
        </div>

        {badge !== undefined ? (
          <span className="absolute left-1.5 top-1.5 rounded-md bg-black/70 px-2 py-1 text-[10px] font-bold text-white shadow-lg backdrop-blur-sm">
            {badge}
          </span>
        ) : (
          quality !== undefined &&
          quality !== null && (
            <span className="absolute left-1.5 top-1.5 rounded-md border border-accent/40 bg-black/50 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-accent backdrop-blur-sm">
              {quality}
            </span>
          )
        )}

        {favorite !== undefined && (
          <div className="absolute right-1.5 top-1.5">
            <FavoriteButton type={favorite.type} itemId={favorite.itemId} />
          </div>
        )}

        {tag !== undefined && tag !== null && (
          <span className="absolute bottom-1.5 left-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white backdrop-blur-sm">
            {tag}
          </span>
        )}

        {typeof rating === 'number' && rating > 0 && (
          <span className="absolute bottom-1.5 right-1.5 flex items-center gap-0.5 rounded-md bg-black/65 px-1.5 py-0.5 text-[10px] font-bold text-amber-300 backdrop-blur-sm">
            <svg viewBox="0 0 24 24" className="h-2.5 w-2.5" fill="currentColor" aria-hidden>
              <path d="M12 2l2.9 6.3 6.9.7-5.1 4.6 1.4 6.8L12 17.8 5.9 20.4l1.4-6.8L2.2 9l6.9-.7L12 2z" />
            </svg>
            {rating.toFixed(1)}
          </span>
        )}

        {typeof progress === 'number' && progress > 0 && (
          <div className="absolute inset-x-0 bottom-0 h-1 overflow-hidden rounded-b-xl bg-black/50">
            <div className="h-full bg-accent" style={{ width: `${Math.min(progress * 100, 100)}%` }} />
          </div>
        )}
      </div>
      <p className="mt-1.5 truncate text-xs font-medium text-fg">{title}</p>
      {subtitle !== undefined && subtitle !== null && (
        <p className="truncate text-[11px] text-fg-faint">{subtitle}</p>
      )}
    </Link>
  );
}
