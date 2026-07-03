/**
 * Facade SERVICE d'acces aux categories masquees (blacklist) pour la couche UI
 * (voir l'invariant dans `catalogService`). Les composants passent par ici,
 * jamais par `db/repositories/hiddenCategoriesRepository` directement.
 */
export * from '@/db/repositories/hiddenCategoriesRepository';
