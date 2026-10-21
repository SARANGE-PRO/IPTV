import { db } from '@/db/database';

/**
 * Ouverture CONTROLEE de la base locale (Dexie) au demarrage.
 *
 * Avant : la restauration de session ouvrait la base implicitement et, si
 * l'ouverture echouait ou restait bloquee, l'app restait sur le splash sans
 * rien dire. Deux situations reelles :
 *  - MISE A JOUR DE SCHEMA longue : Dexie cree les nouveaux index sur les
 *    tables PLEINES avant d'executer la purge (v10 : ~13 index sur des dizaines
 *    de milliers de films) -> des dizaines de secondes sur iPhone ;
 *  - MISE A JOUR BLOQUEE : un autre onglet/fenetre ZiBTV (Safari gele les
 *    onglets en arriere-plan) tient l'ancienne version et ne repond pas a
 *    `versionchange` -> l'ouverture attend indefiniment.
 * Ce service expose ces etats a l'UI (message explicite) et un reset de secours.
 */

export interface OpenOutcome {
  ok: boolean;
  /** Nom + message de l'erreur (jamais de donnee sensible). */
  error: string | null;
}

export interface OpenCallbacks {
  /** L'ouverture dure (mise a jour de schema en cours). */
  onSlow?: () => void;
  /** Une autre connexion bloque la mise a jour (autre onglet). */
  onBlocked?: () => void;
}

const SLOW_AFTER_MS = 1500;

export async function openLocalDatabase(callbacks: OpenCallbacks = {}): Promise<OpenOutcome> {
  if (db.isOpen()) return { ok: true, error: null };
  const onBlocked = (): void => callbacks.onBlocked?.();
  db.on('blocked', onBlocked);
  const slowTimer = setTimeout(() => callbacks.onSlow?.(), SLOW_AFTER_MS);
  try {
    await db.open();
    return { ok: true, error: null };
  } catch (err) {
    const name = err instanceof Error ? err.name : 'Error';
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `${name}: ${message}`.slice(0, 300) };
  } finally {
    clearTimeout(slowTimer);
    db.on('blocked').unsubscribe(onBlocked);
  }
}

/**
 * Reset de secours : supprime TOUTE la base locale (catalogue, session,
 * favoris, historique, reglages) puis recharge l'app. A n'utiliser que si
 * l'ouverture echoue de facon repetee. Jamais automatique.
 */
export async function resetLocalDatabase(): Promise<void> {
  try {
    await db.delete();
  } finally {
    if (typeof window !== 'undefined') window.location.reload();
  }
}
