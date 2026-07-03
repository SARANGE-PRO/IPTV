const MEDIA_GATEWAY_URL = process.env.NEXT_PUBLIC_MEDIA_GATEWAY_URL?.trim().replace(/\/+$/, '') ?? '';

/**
 * Force une ressource HTTP vers HTTPS avant qu'elle n'atteigne le DOM.
 * Les URL relatives, data:, blob: et les URL deja HTTPS restent intactes.
 *
 * Attention : ceci ne peut pas ajouter TLS a un serveur qui ne propose pas
 * reellement HTTPS. Dans ce cas, le fournisseur Xtream doit exposer un endpoint
 * HTTPS (directement ou derriere un reverse proxy/CDN).
 */
export function secureUrl(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const url = value.trim();
  if (url === '') return null;
  if (url.startsWith('//')) return `https:${url}`;
  if (!/^http:\/\//i.test(url)) return url;

  // Un serveur Xtream HTTP-only doit passer par un relais HTTPS dedie. Le
  // relais valide l'hote cible cote serveur avant de transmettre la requete.
  if (MEDIA_GATEWAY_URL !== '') {
    return `${MEDIA_GATEWAY_URL}/_fetch?url=${encodeURIComponent(url)}`;
  }

  try {
    const parsed = new URL(url);
    parsed.protocol = 'https:';
    // URL normalise automatiquement le port HTTP 80 avant ce changement :
    // l'URL HTTPS retombera donc sur son port 443 par defaut.
    return parsed.toString();
  } catch {
    return url.replace(/^http:\/\//i, 'https://');
  }
}
