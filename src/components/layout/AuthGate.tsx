'use client';

import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { SplashScreen } from '@/components/layout/SplashScreen';
import { StorageErrorScreen } from '@/components/layout/StorageErrorScreen';
import { useAuthStore } from '@/stores/authStore';

const HINTS: Partial<Record<string, string>> = {
  upgrading:
    'Mise à jour du stockage local en cours… Sur un gros catalogue, cela peut prendre une minute. Ne ferme pas l’app.',
  blocked:
    'Un autre onglet ou une autre fenêtre ZiBTV bloque la mise à jour du stockage. Ferme-les pour continuer.',
};

/**
 * Garde d'authentification du groupe (app) : restaure la session au montage,
 * affiche le splash pendant la verification, redirige vers /login si la
 * session est absente ou invalide.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const status = useAuthStore((s) => s.status);
  const storageError = useAuthStore((s) => s.storageError);
  const restoreSession = useAuthStore((s) => s.restoreSession);
  const resetStorage = useAuthStore((s) => s.resetStorage);
  const router = useRouter();

  useEffect(() => {
    void restoreSession();
  }, [restoreSession]);

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login');
  }, [status, router]);

  if (status === 'storage_error') {
    return <StorageErrorScreen detail={storageError} onReset={() => void resetStorage()} />;
  }
  if (status !== 'authenticated') return <SplashScreen hint={HINTS[status]} />;
  return <>{children}</>;
}
