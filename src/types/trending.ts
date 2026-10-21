/** Contrat de la route /api/trending, PARTAGE client/serveur (voir types/football.ts). */
export interface TrendingEntry {
  tmdbId: number;
  type: 'movie' | 'tv';
  title: string;
  year: number | null;
  posterPath: string | null;
  /** Image de fond HD (billboard de l'accueil). */
  backdropPath: string | null;
  overview: string | null;
  rating: number | null;
  genreIds: number[];
}
