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
  /** Ratio 0..1 — barre de progression rouge sous le poster. */
  progress?: number | null;
  favorite?: { type: MediaType; itemId: string };
  className?: string;
}

export function MediaCard({ href, title, posterUrl, subtitle, progress, favorite, className }: MediaCardProps) {
  return (
    <Link href={href} className={cn('group block', className)}>
      <div className="relative">
        <PosterImage src={posterUrl} alt={title} className="aspect-[2/3] w-full rounded-xl" />
        {favorite !== undefined && (
          <div className="absolute right-1.5 top-1.5">
            <FavoriteButton type={favorite.type} itemId={favorite.itemId} />
          </div>
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
