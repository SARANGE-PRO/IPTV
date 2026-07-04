'use client';

import { CatalogHero } from '@/components/media/CatalogHero';
import { MediaBrowser } from '@/components/shared/MediaBrowser';
import type { QuickFilterDefinition, SortOption } from '@/components/shared/MediaBrowser';
import * as catalogRepository from '@/services/data/catalogService';
import * as playbackRepository from '@/services/data/playbackDataService';
import { getSeriesTop10 } from '@/services/ranking/smartRankingService';
import type { Series } from '@/types/models';
import { displayYear } from '@/utils/displayTitle';

const fetchPage = (categoryId: string, offset: number, limit: number, sort: catalogRepository.CatalogSort) =>
  catalogRepository.getSeriesPage(categoryId, offset, limit, sort);
const searchItems = (query: string, limit: number) => catalogRepository.searchSeries(query, limit);
const hrefFor = (s: Series) => `/series/${s.id}`;
const subtitleFor = (s: Series) => {
  // Note affichee UNIQUEMENT en pastille sur la carte -> ici, seulement l'annee.
  const fallback = s.releaseDate != null ? Number.parseInt(s.releaseDate.slice(0, 4), 10) : null;
  const year = displayYear(s.name, Number.isFinite(fallback) ? fallback : null);
  return year !== null ? String(year) : null;
};

const QUICK_FILTERS: QuickFilterDefinition[] = [
  { id: 'fr', label: 'FR' },
  { id: 'top10', label: 'Top 10' },
  { id: 'popular', label: 'Mieux notées' },
  { id: 'new', label: 'Recemment ajoutees' },
  { id: 'progress', label: 'En cours' },
  { id: 'netflix', label: 'Netflix', categoryKeywords: ['netflix'] },
  { id: 'anime', label: 'Anime', categoryKeywords: ['anime', 'manga'] },
  { id: 'kids', label: 'Enfants', categoryKeywords: ['enfant', 'kids', 'jeunesse'] },
  { id: 'doc', label: 'Documentaire', categoryKeywords: ['documentaire', 'documentary'] },
  { id: '4k', label: '4K' },
  { id: 'vostfr', label: 'VOSTFR' },
];

const SORT_OPTIONS: SortOption[] = [
  { id: 'recommended', label: 'Recommande' },
  { id: 'recent', label: 'Recemment ajoute' },
  { id: 'rating', label: 'Mieux note' },
  { id: 'title', label: 'Titre' },
];

async function fetchQuickFilter(id: string, limit: number): Promise<Series[]> {
  if (id === 'fr') return catalogRepository.getFrenchSeries(limit);
  if (id === 'top10') return getSeriesTop10(10);
  if (id === 'popular') return catalogRepository.getTopRatedSeries(limit);
  if (id === 'new') return catalogRepository.getRecentSeries(limit);
  if (id === 'progress') {
    const ids = await playbackRepository.getInProgressSeriesIds(limit);
    const byId = new Map((await catalogRepository.getSeriesByIds(ids)).map((series) => [series.id, series]));
    return ids.map((seriesId) => byId.get(seriesId)).filter((series): series is Series => series !== undefined);
  }
  if (id === '4k') return catalogRepository.searchSeries('4k', limit);
  if (id === 'vostfr') return catalogRepository.searchSeries('vostfr', limit);
  return [];
}

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
      quickFilters={QUICK_FILTERS}
      fetchQuickFilter={fetchQuickFilter}
      sortOptions={SORT_OPTIONS}
      subtitleFor={subtitleFor}
      hero={<CatalogHero section="series" />}
    />
  );
}
