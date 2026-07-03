'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { SplashScreen } from '@/components/layout/SplashScreen';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import type { AuthErrorCode } from '@/services/session/secureSessionService';
import * as secureSessionService from '@/services/session/secureSessionService';
import { useAuthStore } from '@/stores/authStore';

const ERROR_MESSAGES: Record<AuthErrorCode, string> = {
  invalid_credentials: 'Identifiants incorrects. Vérifie le nom d’utilisateur et le mot de passe.',
  expired: 'Abonnement expiré côté serveur.',
  blocked: 'Compte bloqué ou désactivé par le fournisseur.',
  invalid_url: 'URL du serveur invalide. Exemple : http://exemple.com:8080',
  unreachable: 'Serveur injoignable. Vérifie l’URL et ta connexion.',
  timeout: 'Le serveur met trop de temps à répondre. Réessaie.',
  upstream: 'Le serveur a renvoyé une erreur. Réessaie plus tard.',
  invalid_response: 'Réponse inattendue du serveur.',
  invalid_request: 'Requête invalide.',
  unknown: 'Une erreur inattendue est survenue. Réessaie.',
};

export default function LoginPage() {
  const router = useRouter();
  const status = useAuthStore((s) => s.status);
  const error = useAuthStore((s) => s.error);
  const login = useAuthStore((s) => s.login);
  const restoreSession = useAuthStore((s) => s.restoreSession);

  const [serverUrl, setServerUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Acces direct a /login avec session valide -> restauration puis retour accueil.
  useEffect(() => {
    void restoreSession();
  }, [restoreSession]);

  useEffect(() => {
    if (status === 'authenticated') router.replace('/');
  }, [status, router]);

  // Prefill serveur + utilisateur depuis la session enregistree (jamais le mot de passe en champ).
  useEffect(() => {
    let active = true;
    void secureSessionService.getSession().then((session) => {
      if (!active || session === undefined) return;
      setServerUrl((v) => (v === '' ? session.serverUrl : v));
      setUsername((v) => (v === '' ? session.username : v));
      setRememberMe(session.rememberMe);
    });
    return () => {
      active = false;
    };
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    await login({ serverUrl, username, password }, rememberMe);
    setSubmitting(false);
    // Si succes : status passe a 'authenticated' -> redirection via l'effet.
  };

  if (status !== 'unauthenticated') return <SplashScreen />;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm animate-fade-in flex-col justify-center px-6 py-12 pt-safe pb-safe">
      <div className="mb-10 flex items-center gap-3">
        <span className="h-3 w-3 rounded-full bg-accent" />
        <span className="text-lg font-semibold tracking-[0.35em] text-fg">IPTV</span>
      </div>

      <h1 className="text-2xl font-semibold tracking-tight text-fg">Connexion</h1>
      <p className="mt-2 text-sm text-fg-muted">
        Connecte-toi à ton serveur Xtream. La session est conservée sur cet appareil.
      </p>

      {error !== null && !submitting && (
        <div
          role="alert"
          className="mt-6 rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-fg"
        >
          {ERROR_MESSAGES[error]}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <Input
          label="URL du serveur"
          type="text"
          inputMode="url"
          placeholder="http://exemple.com:8080"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          autoComplete="url"
          value={serverUrl}
          onChange={(e) => setServerUrl(e.target.value)}
          required
        />
        <Input
          label="Nom d’utilisateur"
          type="text"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
        <Input
          label="Mot de passe"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        <label className="flex select-none items-center gap-3 py-1">
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
            className="h-5 w-5 rounded accent-accent"
          />
          <span className="text-sm text-fg-muted">Se souvenir de moi</span>
        </label>

        <Button type="submit" size="lg" className="w-full" disabled={submitting}>
          {submitting ? 'Connexion…' : 'Se connecter'}
        </Button>
      </form>

      <p className="mt-8 text-xs leading-relaxed text-fg-faint">
        Usage personnel avec tes propres identifiants. Le mot de passe n’est conservé sur
        l’appareil que si « Se souvenir de moi » est activé.
      </p>
    </main>
  );
}
