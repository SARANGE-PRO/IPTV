/**
 * Facade SERVICE d'acces au cache TMDB persiste pour la couche UI (voir
 * l'invariant dans `catalogService`). Les composants passent par ici, jamais par
 * `db/repositories/tmdbRepository` directement.
 */
export * from '@/db/repositories/tmdbRepository';
