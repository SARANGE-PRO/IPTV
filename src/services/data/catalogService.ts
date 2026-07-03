/**
 * Facade SERVICE d'acces au catalogue pour la couche UI.
 *
 * Invariant d'architecture (CLAUDE.md #1) : les composants passent par la couche
 * `services` et n'importent JAMAIS `db/repositories/*` (Dexie) directement. Ce
 * module est le point d'entree cote UI ; c'est ici qu'ajouter une eventuelle
 * logique de cache/agregation sans toucher aux composants. Les autres services
 * et stores, eux, peuvent continuer d'appeler le repository directement.
 */
export * from '@/db/repositories/catalogRepository';
