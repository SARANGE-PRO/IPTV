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

/**
 * Flux video : HTTP -> passerelle HTTPS ; HTTPS/relatif inchange.
 *
 * `options.gateway` (defaut true) : quand false, on FORCE le direct (upgrade
 * TLS best-effort) sans router par la passerelle. Utile pour le contenu deja
 * lisible nativement (MP4/HLS) : il ne doit pas casser si la passerelle est
 * eteinte, et le telephone (IP residentielle/mobile) atteint le CDN sans elle.
 */
export function secureMediaUrl(
  value: string | null | undefined,
  options: { gateway?: boolean } = {},
): string | null {
  const { gateway = true } = options;
  if (value === null || value === undefined) return null;
  const url = value.trim();
  if (url === '') return null;
  if (url.startsWith('//')) return `https:${url}`;
  if (!/^http:\/\//i.test(url)) return url;

  // Page HTTP (localhost/dev) : aucune contrainte mixed-content -> lecture
  // DIRECTE depuis l'IP du client. C'est le seul chemin fiable pour les
  // providers dont le CDN bloque les IP datacenter (passerelle -> 456).
  const onHttpsPage = typeof window !== 'undefined' && window.location.protocol === 'https:';
  if (!onHttpsPage) return url;

  // Page HTTPS : mixed-content -> passerelle si demandee ET configuree, sinon
  // upgrade TLS best-effort (echoue proprement si le serveur n'a pas de HTTPS).
  if (gateway && MEDIA_GATEWAY_URL !== '') {
    return `${MEDIA_GATEWAY_URL}/_fetch?url=${encodeURIComponent(url)}`;
  }
  return url.replace(/^http:\/\//i, 'https://');
}

/**
 * Image : jamais la passerelle (elle est reservee a la video). Un logo HTTP est
 * "upgrade" en HTTPS best-effort : sur une page HTTPS, le navigateur bloque
 * l'image HTTP (mixed-content), donc la garder en HTTP = zero logo. La plupart
 * des hotes de logos (souvent le serveur Xtream lui-meme) repondent en HTTPS ;
 * si ce n'est pas le cas, l'image echoue proprement -> fallback monogramme
 * (onError + brokenImageMemory). Aucune requete ne passe par la passerelle.
 */
export function secureImageSrc(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const url = value.trim();
  if (url === '') return null;
  if (url.startsWith('//')) return `https:${url}`;
  if (/^https:\/\//i.test(url)) return url;
  if (/^(data|blob):/i.test(url)) return url;
  if (/^http:\/\//i.test(url)) return url.replace(/^http:\/\//i, 'https://');
  // Schema relatif/inconnu : pas de reseau, fallback monogramme.
  return null;
}
