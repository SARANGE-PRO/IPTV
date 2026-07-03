/**
 * Extraction des identifiants Xtream depuis un lien M3U / get.php complet.
 *
 * Beaucoup de fournisseurs livrent un seul lien du type
 *   http://serveur:port/get.php?username=XXX&password=YYY&type=m3u_plus&output=ts
 * (ou /player_api.php?...). On en tire serverUrl (origine), username et password
 * pour alimenter le meme flux de connexion que la saisie en 3 champs.
 *
 * Rien n'est logge ni persiste ici : simple parsing local d'une chaine.
 */
export interface ParsedM3uCredentials {
  serverUrl: string;
  username: string;
  password: string;
}

/**
 * Lit un parametre de query sur la chaine BRUTE (pas via URLSearchParams, qui
 * decode `+` en espace facon x-www-form-urlencoded : un mot de passe `ab+cd`
 * deviendrait `ab cd`). `decodeURIComponent` gere `%40`->`@` sans toucher aux `+`.
 */
function rawQueryParam(search: string, ...names: string[]): string | null {
  for (const name of names) {
    const m = search.match(new RegExp(`[?&]${name}=([^&#]*)`, 'i'));
    if (m?.[1] !== undefined && m[1] !== '') {
      try {
        return decodeURIComponent(m[1]);
      } catch {
        return m[1];
      }
    }
  }
  return null;
}

export function parseM3uCredentials(input: string): ParsedM3uCredentials | null {
  const trimmed = input.trim();
  if (trimmed === '') return null;

  // Tolere un lien colle sans schema.
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

  const username = rawQueryParam(url.search, 'username', 'user');
  const password = rawQueryParam(url.search, 'password', 'pass');
  if (username === null || password === null) return null;

  // Conserve le prefixe de chemin (ex. "/xtream") en retirant seulement le
  // point d'entree get.php/player_api.php — coherent avec la saisie manuelle
  // (normalizeServerUrl est reapplique par authStore.login).
  const path = url.pathname.replace(/\/(?:get\.php|player_api\.php)\/?$/i, '');
  return { serverUrl: `${url.origin}${path}`, username, password };
}
