/**
 * Profil actif : normal ou PRIVE (mode prive deverrouille par code). Lu une
 * fois au chargement ; changer de profil recharge l'app (tous les stores
 * relisent leur base). Garde en sessionStorage : fermer l'app (iOS la tue en
 * arriere-plan) ramene toujours au profil normal.
 */
const KEY = 'zibtv:profile';

function read(): boolean {
  try {
    return typeof window !== 'undefined' && window.sessionStorage.getItem(KEY) === 'private';
  } catch {
    return false;
  }
}

const privateProfile = read();

export function isPrivateProfile(): boolean {
  return privateProfile;
}

/** Ecrit le profil du PROCHAIN chargement (l'appelant recharge l'app). */
export function setNextProfile(isPrivate: boolean): void {
  try {
    if (isPrivate) window.sessionStorage.setItem(KEY, 'private');
    else window.sessionStorage.removeItem(KEY);
  } catch {
    // stockage indisponible : le mode prive ne peut pas s'ouvrir
  }
}
