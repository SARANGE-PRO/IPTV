import { spawn } from 'node:child_process';
import http from 'node:http';
import { Readable } from 'node:stream';

/**
 * Passerelle media AUTO-HEBERGEE (IP residentielle) — resout les deux murs
 * des providers IPTV grand public :
 *
 *  1. CDN qui bloque les IP datacenter (456) : ici les requetes sortent de
 *     l'IP de la machine hote (maison), acceptee par le CDN.
 *  2. Conteneurs non lisibles en navigateur (MKV/AVI/HEVC-en-MKV...) :
 *     transcodage/remux ffmpeg a la volee vers fMP4 (fragmente) lisible.
 *
 * Exposee en HTTPS via Cloudflare Tunnel (aucun port a ouvrir). L'app pointe
 * NEXT_PUBLIC_MEDIA_GATEWAY_URL vers le hostname du tunnel.
 */

const PORT = Number(process.env.PORT ?? 8080);
const HEADER_TIMEOUT_MS = 20_000;
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

// Un serveur Xtream reste souvent muet/hostile aux User-Agent navigateur.
const UPSTREAM_UA = process.env.UPSTREAM_USER_AGENT?.trim() || 'VLC/3.0.20 LibVLC/3.0.20';

// Transcodage : actif par defaut. Video "copy" (remux, tres leger — Safari lit
// H.264 ET HEVC) ; passer VIDEO_CODEC=libx264 pour une compat navigateur totale.
const TRANSCODE = process.env.TRANSCODE !== '0';
const FFMPEG = process.env.FFMPEG_PATH?.trim() || 'ffmpeg';
const VIDEO_CODEC = process.env.VIDEO_CODEC?.trim() || 'copy';

const UNSUPPORTED_EXT = /\.(mkv|avi|wmv|flv|vob|mpg|mpeg|m2ts|divx|ogm)(?:$|[?#])/i;
const UNSUPPORTED_CT = /matroska|x-msvideo|x-ms-wmv|x-flv|mp2t|avi|divx/i;

function requiredUrl(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} est obligatoire.`);
  const url = new URL(value);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error(`${name} doit etre http/https.`);
  return url;
}
function optionalOrigin(name) {
  const value = process.env[name]?.trim();
  return value ? new URL(value).origin : null;
}
function isHttp(url) {
  return url.protocol === 'http:' || url.protocol === 'https:';
}
/** Le PREMIER saut doit etre un hote allowliste (anti-SSRF). */
function isAllowed(url) {
  return isHttp(url) && allowedHosts.has(url.host.toLowerCase());
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
      if (trimmed !== '' && !trimmed.startsWith('#')) return rewriteReference(trimmed, sourceUrl, origin);
      return line.replace(/URI="([^"]+)"/g, (_m, uri) => `URI="${rewriteReference(uri, sourceUrl, origin)}"`);
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
  // 1er saut : hote allowliste obligatoire. Sauts de redirection suivants :
  // n'importe quel http/https (ils proviennent de TON serveur de confiance,
  // ex. CDN tokenise dont l'IP change) — sans rouvrir la porte au SSRF.
  if (!isAllowed(target)) throw new Error(`Hote non autorise: ${target.host}`);
  let current = target;
  for (let i = 0; i <= maxRedirects; i += 1) {
    if (i > 0 && !isHttp(current)) throw new Error(`Redirection non http(s): ${current.host}`);
    const response = await fetch(current, { ...init, redirect: 'manual' });
    if (![301, 302, 303, 307, 308].includes(response.status)) return { response, finalUrl: current };
    const location = response.headers.get('location');
    if (!location) return { response, finalUrl: current };
    await response.body?.cancel();
    current = new URL(location, current);
  }
  throw new Error('Trop de redirections en amont.');
}

/** Remux/transcode le flux upstream (stdin) vers du fMP4 (stdout) lisible en <video>. */
function transcodeToFragmentedMp4(sourceStream, res) {
  const args = [
    '-hide_banner', '-loglevel', 'error', '-nostdin',
    '-fflags', '+genpts', '-i', 'pipe:0',
    '-map', '0:v:0', '-map', '0:a:0?',
    '-c:v', VIDEO_CODEC,
    ...(VIDEO_CODEC === 'libx264' ? ['-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p'] : []),
    '-c:a', 'aac', '-b:a', '160k', '-ac', '2',
    '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
    '-f', 'mp4', 'pipe:1',
  ];
  const ff = spawn(FFMPEG, args, { stdio: ['pipe', 'pipe', 'pipe'] });
  res.writeHead(200, {
    'content-type': 'video/mp4',
    'cache-control': 'no-store',
    // fMP4 en direct : pas de seek fiable -> on ne prometteur pas de Range.
    'accept-ranges': 'none',
  });
  sourceStream.pipe(ff.stdin);
  ff.stdout.pipe(res);
  ff.stderr.on('data', () => {}); // ne journalise aucune URL
  const cleanup = () => {
    sourceStream.destroy?.();
    ff.kill('SIGKILL');
  };
  ff.on('error', () => {
    if (!res.headersSent) res.writeHead(502).end('Transcodage indisponible (ffmpeg absent ?).');
    else res.destroy();
    cleanup();
  });
  ff.on('close', () => {
    if (!res.writableEnded) res.end();
  });
  res.once('close', cleanup);
  sourceStream.on('error', cleanup);
}

const server = http.createServer(async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return void res.writeHead(204).end();
  if (req.url === '/_health') return void res.writeHead(200, { 'content-type': 'text/plain' }).end('ok');
  if (req.method !== 'GET' && req.method !== 'HEAD') return void res.writeHead(405, { allow: 'GET, HEAD, OPTIONS' }).end();

  const aborter = new AbortController();
  const headerTimer = setTimeout(() => aborter.abort(), HEADER_TIMEOUT_MS);
  res.once('close', () => {
    if (!res.writableEnded) aborter.abort();
  });

  try {
    const target = targetFor(req);
    if (!isAllowed(target)) {
      clearTimeout(headerTimer);
      return void res.writeHead(403, { 'content-type': 'text/plain' }).end('Hote non autorise.');
    }

    // UA player + Range (seek passthrough). On ne transmet PAS l'UA navigateur.
    const headers = new Headers({ 'user-agent': UPSTREAM_UA, accept: '*/*' });
    const range = req.headers.range;
    if (typeof range === 'string') headers.set('range', range);

    const { response, finalUrl } = await fetchAllowed(target, { method: req.method, headers, signal: aborter.signal });
    clearTimeout(headerTimer);

    const contentType = response.headers.get('content-type') ?? '';
    const urlStr = finalUrl.toString();
    const originalStr = target.toString(); // le CDN masque souvent l'extension apres redirection
    const isPlaylist = /mpegurl/i.test(contentType) || /\.m3u8(?:$|[?#])/i.test(urlStr);
    const needsTranscode =
      TRANSCODE &&
      req.method === 'GET' &&
      !isPlaylist &&
      response.body !== null &&
      (UNSUPPORTED_EXT.test(originalStr) || UNSUPPORTED_EXT.test(urlStr) || UNSUPPORTED_CT.test(contentType));

    if (needsTranscode) {
      return void transcodeToFragmentedMp4(Readable.fromWeb(response.body), res);
    }

    for (const name of [
      'accept-ranges', 'cache-control', 'content-disposition', 'content-length',
      'content-range', 'content-type', 'etag', 'last-modified',
    ]) {
      const value = response.headers.get(name);
      if (value) res.setHeader(name, value);
    }

    if (req.method === 'HEAD' || response.body === null) return void res.writeHead(response.status).end();

    if (isPlaylist) {
      const body = await response.text();
      if (Buffer.byteLength(body) > MAX_PLAYLIST_BYTES) throw new Error('Playlist trop volumineuse.');
      res.removeHeader('content-length');
      res.removeHeader('etag');
      return void res.writeHead(response.status).end(rewritePlaylist(body, finalUrl, publicOrigin(req)));
    }

    res.writeHead(response.status);
    Readable.fromWeb(response.body).pipe(res);
  } catch (error) {
    clearTimeout(headerTimer);
    if (res.headersSent) return void res.destroy();
    for (const name of ['content-length', 'content-range', 'etag']) res.removeHeader(name);
    const forbidden = error instanceof Error && error.message.startsWith('Hote non autorise:');
    res.writeHead(forbidden ? 403 : 502, { 'content-type': 'text/plain' }).end('Flux amont indisponible.');
  }
});

server.requestTimeout = 0;
server.headersTimeout = 30_000;
server.keepAliveTimeout = 65_000;
server.listen(PORT, '0.0.0.0');
