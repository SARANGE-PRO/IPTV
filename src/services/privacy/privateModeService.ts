import { isPrivateProfile, setNextProfile } from '@/db/profile';

/**
 * Mode prive : profil separe (favoris, onglets, progression, recentes,
 * recherches) ouvert par un code, depuis un geste discret des Reglages.
 *
 * Honnetete : c'est de la DISCRETION, pas du chiffrement. La base privee est
 * sur l'appareil, lisible par qui a acces au telephone deverrouille et sait
 * fouiller le stockage du navigateur ; un code a 4 chiffres ne protegerait
 * pas un chiffrement. Le code n'est pas ecrit en clair : seule son empreinte.
 */

const PIN_SALT = 'zibtv-prive:';
/** Empreinte FNV-1a du code (sel + code). */
const PIN_FINGERPRINT = 'e3a2775a';

const FAILS_KEY = 'zibtv:pin-fails';
const MAX_FAILS = 5;
const LOCK_MS = 60_000;
/** Hors de l'app plus longtemps : le mode prive se referme seul. */
export const PRIVATE_AUTOLOCK_MS = 15 * 60_000;

/** Empreinte FNV-1a 32 bits (pure ; crypto.subtle est absent en HTTP). */
export function fingerprint(value: string): string {
  let h = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(value)) {
    h ^= byte;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export function isPinValid(pin: string): boolean {
  return /^\d{4}$/.test(pin) && fingerprint(PIN_SALT + pin) === PIN_FINGERPRINT;
}

interface Fails {
  count: number;
  lockedUntil: number;
}

function readFails(): Fails {
  try {
    const raw = window.sessionStorage.getItem(FAILS_KEY);
    return raw !== null ? (JSON.parse(raw) as Fails) : { count: 0, lockedUntil: 0 };
  } catch {
    return { count: 0, lockedUntil: 0 };
  }
}

function writeFails(fails: Fails): void {
  try {
    window.sessionStorage.setItem(FAILS_KEY, JSON.stringify(fails));
  } catch {
    // sans stockage : pas de blocage persistant entre deux rechargements
  }
}

/** Saisie bloquee (trop d'erreurs) jusqu'a cette heure ; 0 = libre. */
export function pinLockedUntil(now: number = Date.now()): number {
  const { lockedUntil } = readFails();
  return lockedUntil > now ? lockedUntil : 0;
}

export type UnlockResult = 'ok' | 'wrong' | 'locked';

/** Verifie le code ; 5 erreurs = 60 s de blocage. */
export function tryUnlock(pin: string, now: number = Date.now()): UnlockResult {
  if (pinLockedUntil(now) > 0) return 'locked';
  if (isPinValid(pin)) {
    writeFails({ count: 0, lockedUntil: 0 });
    return 'ok';
  }
  const fails = readFails();
  const count = fails.count + 1;
  writeFails(count >= MAX_FAILS ? { count: 0, lockedUntil: now + LOCK_MS } : { count, lockedUntil: 0 });
  return count >= MAX_FAILS ? 'locked' : 'wrong';
}

export function isPrivateMode(): boolean {
  return isPrivateProfile();
}

/** Bascule de profil : rechargement complet sur l'accueil (tous les stores relisent). */
function switchProfile(isPrivate: boolean): void {
  setNextProfile(isPrivate);
  window.location.replace('/');
}

export function enterPrivateMode(): void {
  switchProfile(true);
}

export function exitPrivateMode(): void {
  switchProfile(false);
}

/**
 * Verrou automatique : revenu dans l'app apres plus de 15 min dehors, le mode
 * prive se referme (telephone pose, prete…). Retourne le nettoyage.
 */
export function installPrivateAutoLock(): () => void {
  if (!isPrivateProfile()) return () => undefined;
  let hiddenAt: number | null = null;
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now();
      return;
    }
    if (hiddenAt !== null && Date.now() - hiddenAt >= PRIVATE_AUTOLOCK_MS) exitPrivateMode();
    hiddenAt = null;
  };
  document.addEventListener('visibilitychange', onVisibility);
  return () => document.removeEventListener('visibilitychange', onVisibility);
}
