'use client';

import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { SplashScreen } from '@/components/layout/SplashScreen';
import { useAuthStore } from '@/stores/authStore';

/**
 * Garde d'authentification du groupe (app) : restaure la session au montage,
 * affiche le splash pendant la verification, redirige vers /login si la
 * session est absente ou invalide.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const status = useAuthStore((s) => s.status);
  const restoreSession = useAuthStore((s) => s.restoreSession);
  const router = useRouter();

  useEffect(() => {
    void restoreSession();
  }, [restoreSession]);

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login');
  }, [status, router]);

  if (status !== 'authenticated') return <SplashScreen />;
  return <>{children}</>;
}
