/**
 * Facade SERVICE d'acces aux reglages persistes pour la couche UI (voir
 * l'invariant dans `catalogService`). Les composants passent par ici, jamais par
 * `db/repositories/settingsRepository` directement.
 */
export * from '@/db/repositories/settingsRepository';
