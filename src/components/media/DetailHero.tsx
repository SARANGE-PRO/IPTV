import { secureImageSrc } from '@/utils/secureUrl';

/** Hero cinematographique des fiches : backdrop plein cadre + degrades de fondu. */
export function DetailHero({ backdropUrl }: { backdropUrl: string | null }) {
  const src = secureImageSrc(backdropUrl);
  return (
    <div className="relative h-48 w-full overflow-hidden sm:h-72 sm:rounded-t-3xl">
      {src !== null ? (
        // eslint-disable-next-line @next/next/no-img-element -- image distante, export statique (pas d'optimiseur)
        <img src={src} alt="" aria-hidden className="h-full w-full animate-fade-in object-cover object-top" />
      ) : (
        <div className="h-full w-full bg-gradient-to-br from-ink-800 to-ink-950" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/60 to-ink-950/10" />
      <div className="absolute inset-0 bg-gradient-to-r from-ink-950/70 to-transparent" />
    </div>
  );
}
