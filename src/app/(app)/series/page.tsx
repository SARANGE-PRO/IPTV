'use client';

import { CatalogHero } from '@/components/media/CatalogHero';
import { MediaBrowser } from '@/components/shared/MediaBrowser';
import * as catalogRepository from '@/services/data/catalogService';
import type { CatalogFilter, FlatSort } from '@/services/data/catalogService';
import { enrichVisibleSeries } from '@/services/tmdb/tmdbEnrichmentService';
import type { Series } from '@/types/models';
import { displayYear } from '@/utils/displayTitle';

const fetchFlatPage = (
  offset: number,
  limit: number,
  sort: FlatSort,
  filter: CatalogFilter,
  hidden?: ReadonlySet<string>,
) => catalogRepository.getAllSeriesPage(offset, limit, sort, filter, hidden);

const searchFiltered = (query: string, filter: CatalogFilter, limit: number, hidden?: ReadonlySet<string>) =>
  catalogRepository.searchSeriesFiltered(query, filter, limit, hidden);

const countItems = (filter: CatalogFilter, hidden?: ReadonlySet<string>) =>
  catalogRepository.countAllSeries(filter, hidden);

const enrichVisible = (items: Series[]) => {
  void enrichVisibleSeries(items);
};

const hrefFor = (s: Series) => `/series/${s.id}`;
const subtitleFor = (s: Series) => {
  const fallback = s.releaseDate != null ? Number.parseInt(s.releaseDate.slice(0, 4), 10) : null;
  const year = displayYear(s.name, s.tmdbYear ?? (Number.isFinite(fallback) ? fallback : null));
  return year !== null ? String(year) : null;
};

export default function SeriesPage() {
  return (
    <MediaBrowser<Series>
      section="series"
      favoriteType="series"
      title="Séries"
      itemNoun="séries"
      hrefFor={hrefFor}
      fetchFlatPage={fetchFlatPage}
      searchFiltered={searchFiltered}
      countItems={countItems}
      enrichVisible={enrichVisible}
      subtitleFor={subtitleFor}
      hero={<CatalogHero section="series" />}
    />
  );
}
