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
  badge?: string;
  /** Pastille langue/variante (VF/VOSTFR/MULTI) en bas a gauche du poster. */
  tag?: string | null;
  /** Ratio 0..1 — barre de progression rouge sous le poster. */
  progress?: number | null;
  favorite?: { type: MediaType; itemId: string };
  className?: string;
}

export function MediaCard({ href, title, posterUrl, subtitle, badge, tag, progress, favorite, className }: MediaCardProps) {
  return (
    <Link
      href={href}
      className={cn(
        'group block rounded-xl outline-none transition-transform duration-200 will-change-transform',
        'hover:-translate-y-1 active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-ink-950',
        className,
      )}
    >
      <div className="relative overflow-hidden rounded-xl border border-white/[0.06] shadow-lg shadow-black/40 transition-all duration-200 group-hover:border-accent/40 group-hover:shadow-xl group-hover:shadow-black/60">
        <PosterImage
          src={posterUrl}
          alt={title}
          className="aspect-[2/3] w-full transition-transform duration-500 group-hover:scale-105"
        />
        {/* Scrim bas : lisibilite des pastilles/badge. */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />
        {badge !== undefined && (
          <span className="absolute left-1.5 top-1.5 rounded-md bg-black/80 px-2 py-1 text-[10px] font-bold text-white shadow-lg">
            {badge}
          </span>
        )}
        {favorite !== undefined && (
          <div className="absolute right-1.5 top-1.5">
            <FavoriteButton type={favorite.type} itemId={favorite.itemId} />
          </div>
        )}
        {tag !== undefined && tag !== null && (
          <span className="absolute bottom-1.5 left-1.5 rounded bg-black/75 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
            {tag}
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
