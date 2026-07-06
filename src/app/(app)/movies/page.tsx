'use client';

import { CatalogHero } from '@/components/media/CatalogHero';
import { MediaBrowser } from '@/components/shared/MediaBrowser';
import * as catalogRepository from '@/services/data/catalogService';
import type { CatalogFilter, FlatSort } from '@/services/data/catalogService';
import { getMovieTop10 } from '@/services/ranking/smartRankingService';
import { enrichVisibleMovies } from '@/services/tmdb/tmdbEnrichmentService';
import type { Movie } from '@/types/models';
import { displayYear } from '@/utils/displayTitle';

const fetchFlatPage = (
  offset: number,
  limit: number,
  sort: FlatSort,
  filter: CatalogFilter,
  hidden?: ReadonlySet<string>,
) => catalogRepository.getAllMoviesPage(offset, limit, sort, filter, hidden);

const searchFiltered = (query: string, filter: CatalogFilter, limit: number, hidden?: ReadonlySet<string>) =>
  catalogRepository.searchMoviesFiltered(query, filter, limit, hidden);

const countItems = (filter: CatalogFilter, hidden?: ReadonlySet<string>) =>
  catalogRepository.countAllMovies(filter, hidden);

const enrichVisible = (items: Movie[]) => {
  void enrichVisibleMovies(items);
};

const QUICK_FILTERS = [
  { id: 'new', label: 'Nouveautés' },
  { id: 'top10', label: 'Top 10' },
  { id: 'popular', label: 'Populaires' },
];

async function fetchQuickFilter(id: string, limit: number): Promise<Movie[]> {
  if (id === 'new') return catalogRepository.getRecentMovies(limit);
  if (id === 'top10') return getMovieTop10(10);
  if (id === 'popular') return catalogRepository.getTopRatedMovies(limit);
  return [];
}

const hrefFor = (m: Movie) => `/movies/${m.id}`;
const subtitleFor = (m: Movie) => {
  const year = displayYear(m.name, m.tmdbYear ?? m.year);
  return year !== null ? String(year) : null;
};

export default function MoviesPage() {
  return (
    <MediaBrowser<Movie>
      section="vod"
      favoriteType="vod"
      title="Films"
      itemNoun="films"
      hrefFor={hrefFor}
      fetchFlatPage={fetchFlatPage}
      searchFiltered={searchFiltered}
      countItems={countItems}
      enrichVisible={enrichVisible}
      quickFilters={QUICK_FILTERS}
      fetchQuickFilter={fetchQuickFilter}
      subtitleFor={subtitleFor}
      hero={<CatalogHero section="vod" />}
    />
  );
}
