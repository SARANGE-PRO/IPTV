'use client';

import { MediaBrowser } from '@/components/shared/MediaBrowser';
import * as catalogRepository from '@/db/repositories/catalogRepository';
import type { Series } from '@/types/models';

const fetchPage = (categoryId: string, offset: number, limit: number) =>
  catalogRepository.getSeriesPage(categoryId, offset, limit);
const searchItems = (query: string, limit: number) => catalogRepository.searchSeries(query, limit);
const hrefFor = (s: Series) => `/series/${s.id}`;
const subtitleFor = (s: Series) => s.releaseDate?.slice(0, 4) ?? s.genre;

export default function SeriesPage() {
  return (
    <MediaBrowser<Series>
      section="series"
      favoriteType="series"
      title="Séries"
      itemNoun="séries"
      hrefFor={hrefFor}
      fetchPage={fetchPage}
      searchItems={searchItems}
      subtitleFor={subtitleFor}
    />
  );
}
