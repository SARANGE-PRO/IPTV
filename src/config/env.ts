/**
 * Lecture typee et centralisee des variables d'environnement.
 *
 * Regle de securite : toute cle sensible reste cote serveur (pas de prefixe
 * NEXT_PUBLIC_). Ce module ne doit etre importe que depuis des Route Handlers
 * ou du code serveur pour les valeurs sensibles.
 */

/** Cle TMDB — disponible uniquement cote serveur (Route Handlers). Etape 9. */
export const TMDB_API_KEY = process.env.TMDB_API_KEY ?? '';

/** Cle football-data.org — scores/matchs foot en direct (serveur uniquement). */
export const FOOTBALL_API_KEY = process.env.FOOTBALL_API_KEY ?? '';

/** Vrai si le code s'execute cote serveur (Node), faux dans le navigateur. */
export const IS_SERVER = typeof window === 'undefined';

/** Vrai en developpement. */
export const IS_DEV = process.env.NODE_ENV !== 'production';
