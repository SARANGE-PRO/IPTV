'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { SettingsCard } from '@/components/settings/SettingsCard';
import { Button } from '@/components/ui/Button';
import { useAuthStore } from '@/stores/authStore';

/** Hote du serveur seul (jamais l'URL complete a l'ecran). */
function serverHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return '—';
  }
}

export function AccountCard() {
  const credentials = useAuthStore((s) => s.credentials);
  const logout = useAuthStore((s) => s.logout);
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    if (loggingOut || !window.confirm('Se déconnecter de ce compte ?')) return;
    setLoggingOut(true);
    await logout();
    router.replace('/login');
  };

  return (
    <SettingsCard title="Compte">
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-fg">{credentials?.username ?? '—'}</span>
          <span className="block truncate text-[11px] text-fg-faint">
            {credentials !== null ? serverHost(credentials.serverUrl) : 'Aucune session'}
          </span>
        </span>
        <Button variant="secondary" size="sm" onClick={() => void handleLogout()} disabled={loggingOut}>
          {loggingOut ? 'Déconnexion…' : 'Se déconnecter'}
        </Button>
      </div>
    </SettingsCard>
  );
}
