import { useEffect } from 'react';
import {
  enterPrivateMode,
  exitPrivateMode,
  installPrivateAutoLock,
  isPrivateMode,
  pinLockedUntil,
  tryUnlock,
} from '@/services/privacy/privateModeService';

/** Mode prive : etat (fixe pour la vie de la page), code, entree / sortie. */
export function usePrivateMode() {
  return { active: isPrivateMode(), tryUnlock, pinLockedUntil, enter: enterPrivateMode, exit: exitPrivateMode };
}

/** Verrou automatique apres une longue absence (monte une fois, dans le shell). */
export function usePrivateAutoLock(): void {
  useEffect(() => installPrivateAutoLock(), []);
}
