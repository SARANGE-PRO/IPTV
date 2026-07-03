/**
 * Facade SERVICE d'acces aux favoris pour la couche UI (voir l'invariant dans
 * `catalogService`). Distincte du `favoritesStore` (etat en memoire) : ici les
 * lectures persistees. Les composants passent par ici, jamais par le repository.
 */
export * from '@/db/repositories/favoritesRepository';
