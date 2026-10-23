'use client';

import { CatalogHero } from '@/components/media/CatalogHero';
import { MediaBrowser } from '@/components/shared/MediaBrowser';
import * as catalogRepository from '@/services/data/catalogService';
import type { CatalogFilter, FlatSort, LaneFilter, PageCursor } from '@/services/data/catalogService';
import { enrichVisibleSeries } from '@/services/tmdb/tmdbEnrichmentService';
import type { MediaVariant } from '@/types/mediaLanguage';
import type { Series } from '@/types/models';
import { seriesHref } from '@/utils/appRoutes';

const fetchFlatPage = (
  cursor: PageCursor,
  limit: number,
  sort: FlatSort,
  lane: LaneFilter,
  order: readonly MediaVariant[],
  filter: CatalogFilter,
  hidden?: ReadonlySet<string>,
) => catalogRepository.getAllSeriesPage(cursor, limit, sort, lane, order, filter, hidden);

const searchFiltered = (
  query: string,
  lane: LaneFilter,
  order: readonly MediaVariant[],
  filter: CatalogFilter,
  limit: number,
  hidden?: ReadonlySet<string>,
) => catalogRepository.searchSeriesFiltered(query, lane, order, filter, limit, hidden);

const countItems = (lane: LaneFilter, filter: CatalogFilter, hidden?: ReadonlySet<string>) =>
  catalogRepository.countAllSeries(lane, filter, hidden);

const enrichVisible = (items: Series[]) => {
  void enrichVisibleSeries(items);
};

const hrefFor = (s: Series) => seriesHref(s.id);
const subtitleFor = (s: Series) => {
  const year = s.tmdbYear ?? s.year;
  return year !== null ? String(year) : null;
};

export default function SeriesPage() {
  return (
    <MediaBrowser<Series>
      section="series"
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
