import { db } from '@/db/database';
import type { SessionRecord, SessionStatus } from '@/types/models';

/**
 * Persistance brute de la session active (enregistrement unique).
 * Seul secureSessionService (etape 2) doit appeler ce repository — c'est lui
 * qui applique la regle "mot de passe stocke uniquement si Se souvenir de moi".
 */

const SESSION_ID = 'active' as const;

export function getSession(): Promise<SessionRecord | undefined> {
  return db.sessions.get(SESSION_ID);
}

export async function putSession(record: Omit<SessionRecord, 'id'>): Promise<void> {
  await db.sessions.put({ ...record, id: SESSION_ID });
}

/** Met a jour le statut apres un test de connexion (lastValidatedAt = maintenant). */
export async function updateSessionStatus(sessionStatus: SessionStatus): Promise<void> {
  await db.sessions.update(SESSION_ID, { sessionStatus, lastValidatedAt: Date.now() });
}

export async function clearSession(): Promise<void> {
  await db.sessions.delete(SESSION_ID);
}
