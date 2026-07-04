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
 * Le serveur Xtream est HTTP-only : sur une page HTTPS (Vercel), un flux HTTP
 * est bloque (mixed-content) et un simple upgrade `http->https` echoue (le
 * serveur ne parle pas TLS). La passerelle est donc le SEUL relais fiable — on
 * y route TOUJOURS le flux HTTP quand elle est configuree. C'est elle qui
 * decide, par ressource, entre passthrough (MP4/segments HLS), reecriture
 * (playlist m3u8) et remux/transcodage (MKV/HEVC, live .ts).
 *
 * NB : une precedente version bypassait la passerelle pour le contenu "natif"
 * (MP4/HLS) en tablant sur un HTTPS direct du CDN — invalide pour un Xtream
 * HTTP-only, ce qui cassait toute la VOD et le Live Safari. Ne pas reintroduire.
 *
 * `options.hls` (Safari + VOD non-natif) : demande a la passerelle un flux HLS
 * (Safari refuse le fMP4 progressif du transcodage -> MediaError 4). Sans effet
 * hors passerelle.
 */
export function secureMediaUrl(
  value: string | null | undefined,
  options: { hls?: boolean; start?: number } = {},
): string | null {
  if (value === null || value === undefined) return null;
  const url = value.trim();
  if (url === '') return null;
  if (url.startsWith('//')) return `https:${url}`;
  if (!/^http:\/\//i.test(url)) return url;

  // Page HTTP (localhost/dev) : aucune contrainte mixed-content -> lecture
  // DIRECTE depuis l'IP du client (le CDN accepte l'IP residentielle).
  const onHttpsPage = typeof window !== 'undefined' && window.location.protocol === 'https:';
  if (!onHttpsPage) return url;

  // Page HTTPS : passerelle si configuree, sinon upgrade TLS best-effort
  // (echoue proprement si le serveur n'a pas de vrai HTTPS).
  if (MEDIA_GATEWAY_URL !== '') {
    let base = `${MEDIA_GATEWAY_URL}/_fetch?url=${encodeURIComponent(url)}`;
    if (options.hls === true) base += '&hls=1';
    // Reprise d'un flux TRANSCODE : la passerelle demarre ffmpeg a cette position
    // (-ss, seek HTTP) -> le flux commence a l'offset, pas depuis 0.
    if (options.start !== undefined && options.start > 0) base += `&start=${Math.floor(options.start)}`;
    return base;
  }
  return url.replace(/^http:\/\//i, 'https://');
}

/**
 * URL d'ARRET d'une session HLS VOD sur la passerelle (a appeler en
 * `navigator.sendBeacon` a la fermeture du lecteur) : tue ffmpeg tout de suite
 * et libere la connexion Xtream (compte a connexion unique -> anti-ban). `value`
 * = l'URL de flux D'ORIGINE (http direct), la meme que celle passee a la lecture.
 * Renvoie null si pas de passerelle configuree ou si l'URL n'est pas concernee.
 */
export function mediaGatewayStopUrl(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const url = value.trim();
  if (!/^http:\/\//i.test(url) || MEDIA_GATEWAY_URL === '') return null;
  return `${MEDIA_GATEWAY_URL}/_hlsstop?url=${encodeURIComponent(url)}`;
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
