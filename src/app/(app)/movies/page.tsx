'use client';

import { MediaBrowser } from '@/components/shared/MediaBrowser';
import * as catalogRepository from '@/db/repositories/catalogRepository';
import type { Movie } from '@/types/models';

const fetchPage = (categoryId: string, offset: number, limit: number) =>
  catalogRepository.getMoviesPage(categoryId, offset, limit);
const searchItems = (query: string, limit: number) => catalogRepository.searchMovies(query, limit);
const hrefFor = (m: Movie) => `/movies/${m.id}`;
const subtitleFor = (m: Movie) => (m.year !== null ? String(m.year) : null);

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
      subtitleFor={subtitleFor}
    />
  );
}
