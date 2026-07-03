import http from 'node:http';
import { Readable } from 'node:stream';

const PORT = Number(process.env.PORT ?? 8080);
const HEADER_TIMEOUT_MS = 15_000;
const MAX_PLAYLIST_BYTES = 10 * 1024 * 1024;
const upstreamOrigin = requiredUrl('UPSTREAM_ORIGIN');
const configuredPublicOrigin = optionalOrigin('PUBLIC_ORIGIN');
const allowedHosts = new Set([
  upstreamOrigin.host.toLowerCase(),
  ...String(process.env.ALLOWED_HOSTS ?? '')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean),
]);

function requiredUrl(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} est obligatoire.`);
  const url = new URL(value);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`${name} doit utiliser http ou https.`);
  }
  return url;
}

function optionalOrigin(name) {
  const value = process.env[name]?.trim();
  if (!value) return null;
  return new URL(value).origin;
}

function isAllowed(url) {
  return (url.protocol === 'http:' || url.protocol === 'https:') && allowedHosts.has(url.host.toLowerCase());
}

function publicOrigin(req) {
  if (configuredPublicOrigin) return configuredPublicOrigin;
  const proto = String(req.headers['x-forwarded-proto'] ?? 'https').split(',')[0].trim();
  const host = String(req.headers['x-forwarded-host'] ?? req.headers.host ?? '').split(',')[0].trim();
  return `${proto}://${host}`;
}

function gatewayUrl(url, origin) {
  return `${origin}/_fetch?url=${encodeURIComponent(url.toString())}`;
}

function rewriteReference(raw, base, origin) {
  try {
    const absolute = new URL(raw, base);
    if (absolute.protocol !== 'http:' && absolute.protocol !== 'https:') return raw;
    return gatewayUrl(absolute, origin);
  } catch {
    return raw;
  }
}

function rewritePlaylist(text, sourceUrl, origin) {
  return text
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (trimmed !== '' && !trimmed.startsWith('#')) {
        return rewriteReference(trimmed, sourceUrl, origin);
      }
      return line.replace(/URI="([^"]+)"/g, (_match, uri) => {
        return `URI="${rewriteReference(uri, sourceUrl, origin)}"`;
      });
    })
    .join('\n');
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Accept, Content-Type, Origin, Range');
  res.setHeader('Access-Control-Expose-Headers', 'Accept-Ranges, Content-Length, Content-Range');
}

function targetFor(req) {
  const incoming = new URL(req.url ?? '/', 'http://gateway.local');
  if (incoming.pathname === '/_fetch') {
    const raw = incoming.searchParams.get('url');
    if (!raw) throw new Error('URL cible absente.');
    return new URL(raw);
  }
  return new URL(`${incoming.pathname}${incoming.search}`, upstreamOrigin);
}

async function fetchAllowed(target, init, maxRedirects = 5) {
  let current = target;
  for (let redirect = 0; redirect <= maxRedirects; redirect += 1) {
    if (!isAllowed(current)) throw new Error(`Hote non autorise: ${current.host}`);
    const response = await fetch(current, { ...init, redirect: 'manual' });
    if (![301, 302, 303, 307, 308].includes(response.status)) return { response, finalUrl: current };
    const location = response.headers.get('location');
    if (!location) return { response, finalUrl: current };
    await response.body?.cancel();
    current = new URL(location, current);
  }
  throw new Error('Trop de redirections en amont.');
}

const server = http.createServer(async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') {
    res.writeHead(204).end();
    return;
  }
  if (req.url === '/_health') {
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' }).end('ok');
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { allow: 'GET, HEAD, OPTIONS' }).end();
    return;
  }

  const aborter = new AbortController();
  const headerTimer = setTimeout(() => aborter.abort(), HEADER_TIMEOUT_MS);
  res.once('close', () => {
    if (!res.writableEnded) aborter.abort();
  });

  try {
    const target = targetFor(req);
    if (!isAllowed(target)) {
      clearTimeout(headerTimer);
      res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' }).end('Hote non autorise.');
      return;
    }

    const headers = new Headers();
    for (const name of ['accept', 'accept-language', 'range', 'user-agent']) {
      const value = req.headers[name];
      if (typeof value === 'string') headers.set(name, value);
    }
    const { response, finalUrl } = await fetchAllowed(target, {
      method: req.method,
      headers,
      signal: aborter.signal,
    });
    clearTimeout(headerTimer);

    const contentType = response.headers.get('content-type') ?? '';
    const playlist = /mpegurl/i.test(contentType) || /\.m3u8(?:$|[?#])/i.test(finalUrl.toString());
    const passthroughHeaders = [
      'accept-ranges',
      'cache-control',
      'content-disposition',
      'content-length',
      'content-range',
      'content-type',
      'etag',
      'last-modified',
    ];
    for (const name of passthroughHeaders) {
      const value = response.headers.get(name);
      if (value) res.setHeader(name, value);
    }

    if (req.method === 'HEAD' || response.body === null) {
      res.writeHead(response.status).end();
      return;
    }
    if (playlist) {
      const length = Number(response.headers.get('content-length') ?? '0');
      if (length > MAX_PLAYLIST_BYTES) throw new Error('Playlist anormalement volumineuse.');
      const body = await response.text();
      if (Buffer.byteLength(body) > MAX_PLAYLIST_BYTES) throw new Error('Playlist anormalement volumineuse.');
      const rewritten = rewritePlaylist(body, finalUrl, publicOrigin(req));
      res.removeHeader('content-length');
      res.removeHeader('etag');
      res.writeHead(response.status).end(rewritten);
      return;
    }

    res.writeHead(response.status);
    Readable.fromWeb(response.body).pipe(res);
  } catch (error) {
    clearTimeout(headerTimer);
    if (res.headersSent) {
      res.destroy();
      return;
    }
    for (const name of ['content-length', 'content-range', 'etag']) res.removeHeader(name);
    const status = error instanceof Error && error.message.startsWith('Hote non autorise:') ? 403 : 502;
    res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' }).end('Flux amont indisponible.');
  }
});

server.requestTimeout = 0;
server.headersTimeout = 30_000;
server.keepAliveTimeout = 65_000;
server.listen(PORT, '0.0.0.0');
