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

  const username = url.searchParams.get('username');
  const password = url.searchParams.get('password');
  if (username === null || username === '' || password === null || password === '') return null;

  // Origine = schema + host + port eventuel, sans chemin ni query.
  return { serverUrl: `${url.protocol}//${url.host}`, username, password };
}
