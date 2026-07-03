import { cn } from '@/lib/cn';

interface BrandLogoProps {
  className?: string;
  markClassName?: string;
  textClassName?: string;
  pulse?: boolean;
}

/** Identite ZiBTV : symbole vectoriel + wordmark typographique adaptatif. */
export function BrandLogo({ className, markClassName, textClassName, pulse = false }: BrandLogoProps) {
  return (
    <div className={cn('flex items-center gap-2.5', className)} aria-label="ZiBTV">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/zibtv-mark.svg"
        alt=""
        aria-hidden="true"
        className={cn('h-8 w-8 object-contain drop-shadow-[0_0_8px_rgba(229,9,20,0.3)]', pulse && 'animate-pulse', markClassName)}
      />
      <span className={cn('font-semibold tracking-[-0.04em] text-fg', textClassName)}>
        ZiB<span className="text-accent">TV</span>
      </span>
    </div>
  );
}
