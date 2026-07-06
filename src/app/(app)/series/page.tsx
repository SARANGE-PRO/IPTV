'use client';

import { CatalogHero } from '@/components/media/CatalogHero';
import { MediaBrowser } from '@/components/shared/MediaBrowser';
import * as catalogRepository from '@/services/data/catalogService';
import type { CatalogFilter, FlatSort } from '@/services/data/catalogService';
import * as playbackRepository from '@/services/data/playbackDataService';
import { getSeriesTop10 } from '@/services/ranking/smartRankingService';
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

const QUICK_FILTERS = [
  { id: 'progress', label: 'En cours' },
  { id: 'top10', label: 'Top 10' },
  { id: 'popular', label: 'Mieux notées' },
  { id: 'new', label: 'Récemment ajoutées' },
];

async function fetchQuickFilter(id: string, limit: number): Promise<Series[]> {
  if (id === 'top10') return getSeriesTop10(10);
  if (id === 'popular') return catalogRepository.getTopRatedSeries(limit);
  if (id === 'new') return catalogRepository.getRecentSeries(limit);
  if (id === 'progress') {
    const ids = await playbackRepository.getInProgressSeriesIds(limit);
    const byId = new Map((await catalogRepository.getSeriesByIds(ids)).map((s) => [s.id, s]));
    return ids.map((seriesId) => byId.get(seriesId)).filter((s): s is Series => s !== undefined);
  }
  return [];
}

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
      quickFilters={QUICK_FILTERS}
      fetchQuickFilter={fetchQuickFilter}
      subtitleFor={subtitleFor}
      hero={<CatalogHero section="series" />}
    />
  );
}
