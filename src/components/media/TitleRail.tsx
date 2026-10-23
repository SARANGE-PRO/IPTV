import { MediaCard } from '@/components/shared/MediaCard';
import { Rail } from '@/components/shared/Rail';
import type { Movie, Series } from '@/types/models';
import { movieHref, seriesHref } from '@/utils/appRoutes';
import { displayTitle, displayYear } from '@/utils/displayTitle';
import { variantBadge } from '@/utils/variantPreference';

/** Rangee d'affiches films OU series (fiches : similaires, saga). */
export function TitleRail({
  title,
  movies,
  series,
  currentGroupKey,
}: {
  title: string;
  movies?: Movie[];
  series?: Series[];
  /** Titre courant (saga) : attenue et libelle « Ce film » (comparaison par groupe de versions). */
  currentGroupKey?: string;
}) {
  const cards = [
    ...(movies ?? []).map((m) => {
      const year = displayYear(m.name, m.tmdbYear ?? m.year);
      const current = currentGroupKey !== undefined && m.groupKey === currentGroupKey;
      return (
        <MediaCard
          key={`vod:${m.id}`}
          className={`w-28 shrink-0 sm:w-32 ${current ? 'opacity-50' : ''}`}
          href={movieHref(m.id)}
          replace
          title={displayTitle(m.name)}
          posterUrl={m.posterUrl}
          rating={m.ratingSort > 0 ? m.ratingSort : null}
          tag={variantBadge(m.variant, m.variantSource)}
          subtitle={current ? 'Ce film' : year !== null ? String(year) : null}
        />
      );
    }),
    ...(series ?? []).map((s) => {
      const year = s.tmdbYear ?? s.year;
      return (
        <MediaCard
          key={`series:${s.id}`}
          className="w-28 shrink-0 sm:w-32"
          href={seriesHref(s.id)}
          replace
          title={displayTitle(s.name)}
          posterUrl={s.posterUrl}
          rating={s.ratingSort > 0 ? s.ratingSort : null}
          tag={variantBadge(s.variant, s.variantSource)}
          subtitle={year !== null ? String(year) : null}
        />
      );
    }),
  ];
  if (cards.length === 0) return null;
  return <Rail title={title}>{cards}</Rail>;
}
