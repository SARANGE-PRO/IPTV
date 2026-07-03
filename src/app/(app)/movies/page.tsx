'use client';

import { MediaBrowser } from '@/components/shared/MediaBrowser';
import type { QuickFilterDefinition, SortOption } from '@/components/shared/MediaBrowser';
import * as catalogRepository from '@/db/repositories/catalogRepository';
import { getMovieTop10 } from '@/services/ranking/smartRankingService';
import type { Movie } from '@/types/models';
import { displayYear } from '@/utils/displayTitle';

const fetchPage = (categoryId: string, offset: number, limit: number, sort: catalogRepository.CatalogSort) =>
  catalogRepository.getMoviesPage(categoryId, offset, limit, sort);
const searchItems = (query: string, limit: number) => catalogRepository.searchMovies(query, limit);
const hrefFor = (m: Movie) => `/movies/${m.id}`;
const subtitleFor = (m: Movie) => {
  const year = displayYear(m.name, m.year);
  return [year !== null ? String(year) : null, m.rating !== null ? `★ ${m.rating.toFixed(1)}` : null]
    .filter((value): value is string => value !== null)
    .join(' · ');
};

const QUICK_FILTERS: QuickFilterDefinition[] = [
  { id: 'fr', label: 'FR' },
  { id: 'new', label: 'Nouveautes' },
  { id: 'top10', label: 'Top 10' },
  { id: 'popular', label: 'Populaires' },
  { id: 'action', label: 'Action', categoryKeywords: ['action'] },
  { id: 'comedy', label: 'Comedie', categoryKeywords: ['comedie', 'comedy'] },
  { id: 'thriller', label: 'Thriller', categoryKeywords: ['thriller'] },
  { id: 'horror', label: 'Horreur', categoryKeywords: ['horreur', 'horror'] },
  { id: 'kids', label: 'Enfants', categoryKeywords: ['enfant', 'kids', 'jeunesse'] },
  { id: 'doc', label: 'Documentaire', categoryKeywords: ['documentaire', 'documentary'] },
  { id: '4k', label: '4K' },
  { id: 'vf', label: 'VF' },
  { id: 'vostfr', label: 'VOSTFR' },
];

const SORT_OPTIONS: SortOption[] = [
  { id: 'recommended', label: 'Recommande' },
  { id: 'recent', label: 'Recemment ajoute' },
  { id: 'rating', label: 'Mieux note' },
  { id: 'year', label: 'Annee' },
  { id: 'title', label: 'Titre' },
];

async function fetchQuickFilter(id: string, limit: number): Promise<Movie[]> {
  if (id === 'fr') return catalogRepository.getFrenchMovies(limit);
  if (id === 'new') return catalogRepository.getRecentMovies(limit);
  if (id === 'top10') return getMovieTop10(10);
  if (id === 'popular') return catalogRepository.getTopRatedMovies(limit);
  if (id === '4k') return catalogRepository.searchMovies('4k', limit);
  if (id === 'vf') return catalogRepository.searchMovies('vf', limit);
  if (id === 'vostfr') return catalogRepository.searchMovies('vostfr', limit);
  return [];
}

export default function MoviesPage() {
  return (
    <MediaBrowser<Movie>
      section="vod"
      favoriteType="vod"
      title="Films"
      itemNoun="films"
      hrefFor={hrefFor}
      fetchPage={fetchPage}
      searchItems={searchItems}
      quickFilters={QUICK_FILTERS}
      fetchQuickFilter={fetchQuickFilter}
      sortOptions={SORT_OPTIONS}
      subtitleFor={subtitleFor}
    />
  );
}
