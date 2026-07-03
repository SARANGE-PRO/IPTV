import * as sessionRepository from '@/db/repositories/sessionRepository';
import * as xtreamApi from '@/services/xtream/xtreamApi';
import { XtreamApiError, type XtreamErrorCode } from '@/services/xtream/xtreamClient';
import type { SessionRecord, SessionStatus } from '@/types/models';
import type { XtreamAuthResponse, XtreamCredentials } from '@/types/xtream';

/**
 * SEULE couche autorisee a manipuler les identifiants persistes.
 *
 * Regle (amendement valide) : session minimale — le mot de passe n'est stocke
 * que si "Se souvenir de moi" est active. Jamais de log des identifiants.
 *
 * Limites assumees : IndexedDB n'est pas chiffre (pas d'equivalent Keychain
 * en PWA) et iOS peut purger le stockage — voir docs/ARCHITECTURE.md §2.
 */

export type AuthErrorCode = XtreamErrorCode | 'invalid_credentials' | 'expired' | 'blocked';

export type ValidationResult =
  | { ok: true; auth: XtreamAuthResponse }
  | { ok: false; code: AuthErrorCode };

/** Teste les identifiants aupres du serveur (via le proxy metadonnees). */
export async function validateCredentials(creds: XtreamCredentials): Promise<ValidationResult> {
  try {
    const auth = await xtreamApi.authenticate(creds);
    const info = auth.user_info;
    const isAuth = info !== undefined && (info.auth === 1 || info.auth === '1' || info.auth === true);
    if (!isAuth) return { ok: false, code: 'invalid_credentials' };

    const status = info.status.toLowerCase();
    if (status === 'expired') return { ok: false, code: 'expired' };
    if (status === 'banned' || status === 'disabled') return { ok: false, code: 'blocked' };
    return { ok: true, auth };
  } catch (err) {
    if (err instanceof XtreamApiError) return { ok: false, code: err.code };
    return { ok: false, code: 'unknown' };
  }
}

export async function saveSession(creds: XtreamCredentials, rememberMe: boolean): Promise<void> {
  const now = Date.now();
  const record: Omit<SessionRecord, 'id'> = {
    serverUrl: creds.serverUrl,
    username: creds.username,
    rememberMe,
    createdAt: now,
    lastValidatedAt: now,
    sessionStatus: 'valid',
    ...(rememberMe ? { password: creds.password } : {}),
  };
  await sessionRepository.putSession(record);
}

export function getSession(): Promise<SessionRecord | undefined> {
  return sessionRepository.getSession();
}

/** Identifiants complets si "Se souvenir de moi" etait actif, sinon null. */
export async function getStoredCredentials(): Promise<XtreamCredentials | null> {
  const session = await sessionRepository.getSession();
  if (session === undefined || session.password === undefined) return null;
  return { serverUrl: session.serverUrl, username: session.username, password: session.password };
}

export function markSessionStatus(status: SessionStatus): Promise<void> {
  return sessionRepository.updateSessionStatus(status);
}

export function clearSession(): Promise<void> {
  return sessionRepository.clearSession();
}
