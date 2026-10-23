'use client';

import { CatalogHero } from '@/components/media/CatalogHero';
import { MediaBrowser } from '@/components/shared/MediaBrowser';
import * as catalogRepository from '@/services/data/catalogService';
import type { CatalogFilter, FlatSort, LaneFilter, PageCursor } from '@/services/data/catalogService';
import { enrichVisibleMovies } from '@/services/tmdb/tmdbEnrichmentService';
import type { MediaVariant } from '@/types/mediaLanguage';
import type { Movie } from '@/types/models';
import { displayYear } from '@/utils/displayTitle';
import { movieHref } from '@/utils/appRoutes';

const fetchFlatPage = (
  cursor: PageCursor,
  limit: number,
  sort: FlatSort,
  lane: LaneFilter,
  order: readonly MediaVariant[],
  filter: CatalogFilter,
  hidden?: ReadonlySet<string>,
) => catalogRepository.getAllMoviesPage(cursor, limit, sort, lane, order, filter, hidden);

const searchFiltered = (
  query: string,
  lane: LaneFilter,
  order: readonly MediaVariant[],
  filter: CatalogFilter,
  limit: number,
  hidden?: ReadonlySet<string>,
) => catalogRepository.searchMoviesFiltered(query, lane, order, filter, limit, hidden);

const countItems = (lane: LaneFilter, filter: CatalogFilter, hidden?: ReadonlySet<string>) =>
  catalogRepository.countAllMovies(lane, filter, hidden);

const enrichVisible = (items: Movie[]) => {
  void enrichVisibleMovies(items);
};

const hrefFor = (m: Movie) => movieHref(m.id);
const subtitleFor = (m: Movie) => {
  const year = displayYear(m.name, m.tmdbYear ?? m.year);
  return year !== null ? String(year) : null;
};

export default function MoviesPage() {
  return (
    <MediaBrowser<Movie>
      section="vod"
      title="Films"
      itemNoun="films"
      hrefFor={hrefFor}
      fetchFlatPage={fetchFlatPage}
      searchFiltered={searchFiltered}
      countItems={countItems}
      enrichVisible={enrichVisible}
      subtitleFor={subtitleFor}
      hero={<CatalogHero section="vod" />}
    />
  );
}
