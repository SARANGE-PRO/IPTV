const MAX_PLAYLIST_BYTES = 10 * 1024 * 1024;

function configuration(env) {
  const rawOrigin = env.UPSTREAM_ORIGIN?.trim();
  if (!rawOrigin) throw new Error('UPSTREAM_ORIGIN est obligatoire.');
  const upstreamOrigin = new URL(rawOrigin);
  if (upstreamOrigin.protocol !== 'http:' && upstreamOrigin.protocol !== 'https:') {
    throw new Error('UPSTREAM_ORIGIN doit utiliser http ou https.');
  }
  const allowedHosts = new Set([
    upstreamOrigin.host.toLowerCase(),
    ...String(env.ALLOWED_HOSTS ?? '')
      .split(',')
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean),
  ]);
  return { upstreamOrigin, allowedHosts };
}

function isAllowed(url, allowedHosts) {
  return (url.protocol === 'http:' || url.protocol === 'https:') && allowedHosts.has(url.host.toLowerCase());
}

function gatewayUrl(url, publicOrigin) {
  return `${publicOrigin}/_fetch?url=${encodeURIComponent(url.toString())}`;
}

function rewriteReference(raw, base, publicOrigin) {
  try {
    const absolute = new URL(raw, base);
    if (absolute.protocol !== 'http:' && absolute.protocol !== 'https:') return raw;
    return gatewayUrl(absolute, publicOrigin);
  } catch {
    return raw;
  }
}

function rewritePlaylist(text, sourceUrl, publicOrigin) {
  return text
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (trimmed !== '' && !trimmed.startsWith('#')) {
        return rewriteReference(trimmed, sourceUrl, publicOrigin);
      }
      return line.replace(/URI="([^"]+)"/g, (_match, uri) => {
        return `URI="${rewriteReference(uri, sourceUrl, publicOrigin)}"`;
      });
    })
    .join('\n');
}

function corsHeaders(headers = new Headers()) {
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Accept, Content-Type, Origin, Range');
  headers.set('Access-Control-Expose-Headers', 'Accept-Ranges, Content-Length, Content-Range');
  return headers;
}

function targetFor(request, upstreamOrigin) {
  const incoming = new URL(request.url);
  if (incoming.pathname === '/_fetch') {
    const raw = incoming.searchParams.get('url');
    if (!raw) throw new Error('URL cible absente.');
    return new URL(raw);
  }
  return new URL(`${incoming.pathname}${incoming.search}`, upstreamOrigin);
}

async function fetchAllowed(target, init, allowedHosts, maxRedirects = 5) {
  let current = target;
  for (let redirect = 0; redirect <= maxRedirects; redirect += 1) {
    if (!isAllowed(current, allowedHosts)) throw new Error(`Hote non autorise: ${current.host}`);
    const response = await fetch(current, { ...init, redirect: 'manual' });
    if (![301, 302, 303, 307, 308].includes(response.status)) return { response, finalUrl: current };
    const location = response.headers.get('location');
    if (!location) return { response, finalUrl: current };
    await response.body?.cancel();
    current = new URL(location, current);
  }
  throw new Error('Trop de redirections en amont.');
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders();
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const incoming = new URL(request.url);
    if (incoming.pathname === '/_health') return new Response('ok', { headers: cors });
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      cors.set('Allow', 'GET, HEAD, OPTIONS');
      return new Response(null, { status: 405, headers: cors });
    }

    try {
      const { upstreamOrigin, allowedHosts } = configuration(env);
      const target = targetFor(request, upstreamOrigin);
      if (!isAllowed(target, allowedHosts)) {
        return new Response('Hote non autorise.', { status: 403, headers: cors });
      }

      // Beaucoup de serveurs Xtream renvoient 456 pour un User-Agent de
      // navigateur (ils n'autorisent que des players). On envoie donc un UA
      // de player (VLC par defaut, surchargeable via UPSTREAM_USER_AGENT) et
      // on ne transmet PAS l'UA du navigateur. Range conserve pour le seek.
      const requestHeaders = new Headers();
      requestHeaders.set('user-agent', env.UPSTREAM_USER_AGENT?.trim() || 'VLC/3.0.20 LibVLC/3.0.20');
      requestHeaders.set('accept', '*/*');
      const range = request.headers.get('range');
      if (range) requestHeaders.set('range', range);
      const { response, finalUrl } = await fetchAllowed(
        target,
        { method: request.method, headers: requestHeaders },
        allowedHosts,
      );
      const headers = corsHeaders(new Headers(response.headers));
      headers.delete('set-cookie');

      if (request.method === 'HEAD' || response.body === null) {
        return new Response(null, { status: response.status, headers });
      }

      const contentType = response.headers.get('content-type') ?? '';
      const playlist = /mpegurl/i.test(contentType) || /\.m3u8(?:$|[?#])/i.test(finalUrl.toString());
      if (playlist) {
        const length = Number(response.headers.get('content-length') ?? '0');
        if (length > MAX_PLAYLIST_BYTES) throw new Error('Playlist anormalement volumineuse.');
        const body = await response.text();
        if (new TextEncoder().encode(body).byteLength > MAX_PLAYLIST_BYTES) {
          throw new Error('Playlist anormalement volumineuse.');
        }
        const rewritten = rewritePlaylist(body, finalUrl, incoming.origin);
        headers.delete('content-length');
        headers.delete('etag');
        return new Response(rewritten, { status: response.status, headers });
      }

      // Le corps reste un ReadableStream : aucun film n'est charge en memoire.
      return new Response(response.body, { status: response.status, headers });
    } catch (error) {
      const forbidden = error instanceof Error && error.message.startsWith('Hote non autorise:');
      return new Response('Flux amont indisponible.', {
        status: forbidden ? 403 : 502,
        headers: cors,
      });
    }
  },
};
