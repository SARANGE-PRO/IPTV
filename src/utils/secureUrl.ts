const MEDIA_GATEWAY_URL = process.env.NEXT_PUBLIC_MEDIA_GATEWAY_URL?.trim().replace(/\/+$/, '') ?? '';

/**
 * Coquille servie en HTTP PUR (voir infra/http-shell) : la page n'est pas en
 * HTTPS, donc aucune contrainte mixed-content. Constante de BUILD (et non
 * `window.location.protocol`) pour que serveur et client calculent la meme URL
 * d'image au rendu (sinon mismatch d'hydratation sur l'attribut `src`).
 */
const PLAIN_HTTP_SHELL = process.env.NEXT_PUBLIC_PLAIN_HTTP === '1';

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
 * Page HTTP (coquille infra/http-shell, ou dev local) : aucune contrainte
 * mixed-content -> lecture DIRECTE depuis l'IP du client (le CDN accepte l'IP
 * residentielle/mobile), SANS passerelle. Seule exception : `options.transcode`
 * (conteneur non-natif, passerelle sondee joignable) -> on route quand meme
 * vers la passerelle, car c'est le transcodage qu'on veut, pas le relais HTTPS.
 *
 * `options.hls` (Safari + VOD non-natif) : demande a la passerelle un flux HLS
 * (Safari refuse le fMP4 progressif du transcodage -> MediaError 4). Sans effet
 * hors passerelle.
 */
export function secureMediaUrl(
  value: string | null | undefined,
  options: { hls?: boolean; start?: number; transcode?: boolean } = {},
): string | null {
  if (value === null || value === undefined) return null;
  const url = value.trim();
  if (url === '') return null;
  if (url.startsWith('//')) return PLAIN_HTTP_SHELL ? `http:${url}` : `https:${url}`;
  if (!/^http:\/\//i.test(url)) return url;

  const onHttpsPage = typeof window !== 'undefined' && window.location.protocol === 'https:';
  const gatewayConfigured = MEDIA_GATEWAY_URL !== '';

  // Page HTTP : direct, sauf transcodage explicitement demande ET passerelle
  // configuree (elle est en HTTPS : chargeable depuis une page HTTP).
  if (!onHttpsPage && !(options.transcode === true && gatewayConfigured)) return url;

  // Page HTTPS : passerelle si configuree, sinon upgrade TLS best-effort
  // (echoue proprement si le serveur n'a pas de vrai HTTPS).
  if (gatewayConfigured) {
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
 *
 * Coquille HTTP pure : pas d'upgrade (un Xtream HTTP-only servirait zero logo
 * en HTTPS) — l'image HTTP est chargee telle quelle.
 */
export function secureImageSrc(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const url = value.trim();
  if (url === '') return null;
  if (url.startsWith('//')) return PLAIN_HTTP_SHELL ? `http:${url}` : `https:${url}`;
  if (/^https:\/\//i.test(url)) return url;
  if (/^(data|blob):/i.test(url)) return url;
  if (/^http:\/\//i.test(url)) return PLAIN_HTTP_SHELL ? url : url.replace(/^http:\/\//i, 'https://');
  // Schema relatif/inconnu : pas de reseau, fallback monogramme.
  return null;
}
