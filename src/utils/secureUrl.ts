const MEDIA_GATEWAY_URL = process.env.NEXT_PUBLIC_MEDIA_GATEWAY_URL?.trim().replace(/\/+$/, '') ?? '';

/**
 * Deux politiques STRICTEMENT distinctes selon le type de ressource.
 *
 * VIDEO (secureMediaUrl) : un flux HTTP doit passer par la passerelle HTTPS
 * dediee (mixed-content). La passerelle valide l'hote, gere le Range et
 * reecrit les playlists m3u8.
 *
 * IMAGE (secureImageSrc) : ne JAMAIS router une image via la passerelle video.
 * Les logos/affiches HTTP proviennent d'hotes tiers souvent hors allowlist et
 * proteges contre le hotlink (403) ; en masse ils saturent la passerelle (456)
 * et affament la lecture. On n'accepte donc que le HTTPS ; sinon on retourne
 * null et l'UI affiche un fallback monogramme (voir PosterImage/ChannelLogo).
 */

/** Flux video : HTTP -> passerelle HTTPS ; HTTPS/relatif inchange. */
export function secureMediaUrl(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const url = value.trim();
  if (url === '') return null;
  if (url.startsWith('//')) return `https:${url}`;
  if (!/^http:\/\//i.test(url)) return url;

  if (MEDIA_GATEWAY_URL !== '') {
    return `${MEDIA_GATEWAY_URL}/_fetch?url=${encodeURIComponent(url)}`;
  }
  // Sans passerelle configuree : tentative d'upgrade TLS (echoue proprement si
  // le serveur n'a pas de HTTPS -> le player affiche une erreur claire).
  return url.replace(/^http:\/\//i, 'https://');
}

/** Image : HTTPS uniquement (jamais la passerelle). HTTP -> null (monogramme). */
export function secureImageSrc(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const url = value.trim();
  if (url === '') return null;
  if (url.startsWith('//')) return `https:${url}`;
  if (/^https:\/\//i.test(url)) return url;
  if (/^(data|blob):/i.test(url)) return url;
  // HTTP ou schema relatif inconnu : pas de reseau, fallback monogramme.
  return null;
}
