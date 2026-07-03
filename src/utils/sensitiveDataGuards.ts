/**
 * Verification FINALE avant export d'un rapport : si une donnee sensible est
 * detectee malgre la redaction, l'export est bloque (securite par defaut).
 */

export interface CredentialHints {
  serverUrl?: string;
  username?: string;
  password?: string;
}

export function findSensitiveLeaks(serialized: string, hints?: CredentialHints): string[] {
  const leaks: string[] = [];
  const lower = serialized.toLowerCase();

  if (/https?:\/\//i.test(serialized)) leaks.push('url');
  if (/\.(?:m3u8|mp4|mkv|avi)\b/i.test(serialized)) leaks.push('extension-flux');
  if (/\w\.ts\b/i.test(serialized)) leaks.push('extension-flux-ts');
  if (/(?:username|password|token)=/i.test(serialized)) leaks.push('parametre-credentials');

  if (hints?.username !== undefined && hints.username.length >= 3 && lower.includes(hints.username.toLowerCase())) {
    leaks.push('username');
  }
  if (hints?.password !== undefined && hints.password.length >= 3 && lower.includes(hints.password.toLowerCase())) {
    leaks.push('password');
  }
  if (hints?.serverUrl !== undefined) {
    try {
      const host = new URL(hints.serverUrl).host;
      if (host.length >= 4 && lower.includes(host.toLowerCase())) leaks.push('hote-serveur');
    } catch {
      // URL invalide : rien a verifier
    }
  }
  return leaks;
}

/** Jette si le contenu serialise contient une donnee sensible. */
export function assertReportSafe(serialized: string, hints?: CredentialHints): void {
  const leaks = findSensitiveLeaks(serialized, hints);
  if (leaks.length > 0) {
    throw new Error(`Export bloqué — données sensibles détectées : ${leaks.join(', ')}.`);
  }
}
