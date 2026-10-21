import Link from 'next/link';
import { PosterImage } from '@/components/shared/PosterImage';

/** Carte Top 10 facon Netflix : grand chiffre detoure + affiche. */
export function Top10Card({
  rank,
  href,
  title,
  posterUrl,
  badge,
}: {
  rank: number;
  href: string;
  title: string;
  posterUrl: string | null;
  badge: string | null;
}) {
  return (
    <Link
      href={href}
      aria-label={`${rank}. ${title}`}
      className="group flex shrink-0 items-end rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <span
        aria-hidden
        className="-mr-3 select-none text-[104px] font-black leading-[0.78] tracking-[-0.08em] text-ink-950 [-webkit-text-stroke:2px_rgba(255,255,255,0.5)] sm:text-[120px]"
      >
        {rank}
      </span>
      <div className="relative z-10 w-24 overflow-hidden rounded-lg border border-white/[0.06] shadow-lg shadow-black/50 transition-transform duration-200 group-hover:-translate-y-1 sm:w-28">
        <PosterImage src={posterUrl} alt={title} className="aspect-[2/3] w-full" />
        {badge !== null && (
          <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1 py-0.5 text-[9px] font-bold uppercase text-white">
            {badge}
          </span>
        )}
      </div>
    </Link>
  );
}
