/**
 * Facade SERVICE d'acces a l'historique/progression pour la couche UI (voir
 * l'invariant dans `catalogService`). Les composants passent par ici, jamais par
 * `db/repositories/playbackRepository` directement.
 */
export * from '@/db/repositories/playbackRepository';
