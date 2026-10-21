import * as catalogRepository from '@/db/repositories/catalogRepository';
import type { MediaVariant } from '@/types/mediaLanguage';
import type { Movie, Series } from '@/types/models';

/**
 * TITRES SIMILAIRES (fiche + « Parce que tu as regarde » de l'accueil) : genres
 * TMDB en commun, note de tri, une version par titre, variante preferee
 * d'abord. Parcours d'index BORNE (catalogRepository.findMovies/findSeries).
 */

export interface SimilarSource {
  groupKey: string;
  /** Genres TMDB de la source (ligne enrichie, sinon metadonnees de la fiche). */
  genreIds: readonly number[];
}

interface Candidate {
  groupKey: string;
  posterUrl: string | null;
  categoryId: string;
  ratingSort: number;
  tmdbGenreIds: number[];
}

/** Au moins 2 genres en commun (1 si la source n'en a qu'un), hors le titre lui-meme. */
export function similarPredicate<T extends Candidate>(source: SimilarSource, hidden: ReadonlySet<string>): (row: T) => boolean {
  const genres = new Set(source.genreIds);
  const needed = Math.min(2, genres.size);
  return (row) => {
    if (row.groupKey === source.groupKey || row.posterUrl === null || hidden.has(row.categoryId) || row.ratingSort < 5) {
      return false;
    }
    let shared = 0;
    for (const g of row.tmdbGenreIds) if (genres.has(g)) shared += 1;
    return shared >= needed;
  };
}

export async function loadSimilarMovies(
  source: SimilarSource,
  order: readonly MediaVariant[],
  hidden: ReadonlySet<string>,
  limit = 18,
): Promise<Movie[]> {
  if (source.genreIds.length === 0) return [];
  return catalogRepository.findMovies(similarPredicate<Movie>(source, hidden), limit, order, 'rating');
}

export async function loadSimilarSeries(
  source: SimilarSource,
  order: readonly MediaVariant[],
  hidden: ReadonlySet<string>,
  limit = 18,
): Promise<Series[]> {
  if (source.genreIds.length === 0) return [];
  return catalogRepository.findSeries(similarPredicate<Series>(source, hidden), limit, order, 'rating');
}
