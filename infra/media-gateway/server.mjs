import { spawn } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
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

// Transcodage : actif par defaut. Video en libx264 (H.264 8-bit) par defaut :
// c'est le SEUL codec lu de façon fiable par Safari iOS dans un <video>. Le MKV
// est souvent en HEVC/x265 10-bit -> un simple remux (copy) echoue sur iPhone
// (MediaError 4). Mettre VIDEO_CODEC=copy si TON catalogue est deja en H.264
// (remux plus leger en CPU), ou un encodeur materiel (h264_nvenc/qsv/amf) si dispo.
const TRANSCODE = process.env.TRANSCODE !== '0';
const FFMPEG = process.env.FFMPEG_PATH?.trim() || 'ffmpeg';
const VIDEO_CODEC = process.env.VIDEO_CODEC?.trim() || 'libx264';

// Signature HMAC : la passerelle proxifie un hote NON allowliste uniquement si
// l'URL porte une signature valide, donc uniquement les URLs qu'ELLE a
// reecrites dans une playlist issue de l'origine de confiance (segments HLS sur
// des CDN dont l'IP change). Empeche tout SSRF vers un hote arbitraire.
const SIGN_SECRET = process.env.SIGN_SECRET?.trim() || randomBytes(24).toString('hex');
function sign(rawUrl) {
  return createHmac('sha256', SIGN_SECRET).update(rawUrl).digest('hex').slice(0, 20);
}

const UNSUPPORTED_EXT = /\.(mkv|avi|wmv|flv|vob|mpg|mpeg|m2ts|divx|ogm)(?:$|[?#])/i;
// NB : pas de mp2t ici — les segments .ts d'un flux HLS doivent passer tels
// quels (c'est le lecteur qui reassemble le HLS), jamais transcodes un a un.
const UNSUPPORTED_CT = /matroska|x-msvideo|x-ms-wmv|x-flv|avi|divx/i;

// Proxy longue duree : une deconnexion client (le lecteur se ferme / zappe)
// provoque EPIPE/ECONNRESET. Ces erreurs reseau ne doivent JAMAIS tuer le
// process. On les avale ; toute autre erreur est loggee (sans URL) sans crash.
process.on('uncaughtException', (err) => {
  const code = err && err.code;
  if (code === 'EPIPE' || code === 'ECONNRESET' || code === 'ERR_STREAM_PREMATURE_CLOSE') return;
  console.error('[gateway] erreur:', code || (err && err.message) || 'inconnue');
});
process.on('unhandledRejection', () => {});

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

// Anti-SSRF LAN : la passerelle tourne sur le reseau domestique. Un upstream
// compromis/hostile pourrait rediriger vers le routeur (192.168.x), le loopback
// ou les metadonnees cloud (169.254.169.254). On bloque tout hote qui est une IP
// litterale privee/reservee ou un nom d'hote interne, A CHAQUE saut. Les CDN
// (redirections legitimes des segments HLS) restent joignables (hotes publics).
function ipv4ToLong(ip) {
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m === null) return null;
  const p = m.slice(1).map(Number);
  if (p.some((n) => n > 255)) return null;
  return ((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3];
}
function isPrivateIpv4(ip) {
  const long = ipv4ToLong(ip);
  if (long === null) return false;
  const inRange = (base, bits) => {
    const baseLong = ipv4ToLong(base);
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (long & mask) === (baseLong & mask);
  };
  return (
    inRange('0.0.0.0', 8) ||
    inRange('10.0.0.0', 8) ||
    inRange('100.64.0.0', 10) ||
    inRange('127.0.0.0', 8) ||
    inRange('169.254.0.0', 16) ||
    inRange('172.16.0.0', 12) ||
    inRange('192.168.0.0', 16)
  );
}
function isBlockedHost(hostname) {
  const h = hostname.toLowerCase().replace(/\.$/, '');
  if (h === '') return true;
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  if (h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (h === 'metadata.google.internal') return true;
  if (isPrivateIpv4(h)) return true;
  if (h === '::1' || h === '::') return true;
  const mapped = h.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (mapped !== null) return isPrivateIpv4(mapped[1]);
  if (h.includes(':')) {
    const first = h.split(':')[0];
    if (/^f[cd][0-9a-f]{0,2}$/.test(first)) return true; // fc00::/7
    if (/^fe[89ab][0-9a-f]?$/.test(first)) return true; // fe80::/10
  }
  return false;
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
  const raw = url.toString();
  return `${origin}/_fetch?url=${encodeURIComponent(raw)}&_s=${sign(raw)}`;
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
    const target = new URL(raw);
    const sig = incoming.searchParams.get('_s');
    // Autorise si hote d'origine OU signature valide (segment reecrit par nous).
    const allow = isAllowed(target);
    // Une signature identifie aussi un segment HLS de meme origine. Sans ce
    // marqueur, un segment .ts signe mais same-origin serait pris pour un flux
    // Live direct et transcode a tort.
    const viaSig = sig !== null && sig === sign(raw);
    return { target, trusted: allow || viaSig, viaSig };
  }
  const target = new URL(`${incoming.pathname}${incoming.search}`, upstreamOrigin);
  return { target, trusted: isAllowed(target), viaSig: false };
}
async function fetchAllowed(target, init, trusted, maxRedirects = 5) {
  // 1er saut : hote allowliste OU URL signee (segment d'une playlist de
  // confiance). Sauts de redirection suivants : n'importe quel http/https
  // (ils proviennent de TON serveur de confiance) — sans SSRF vers un hote
  // arbitraire non signe.
  if (!trusted && !isAllowed(target)) throw new Error(`Hote non autorise: ${target.host}`);
  let current = target;
  for (let i = 0; i <= maxRedirects; i += 1) {
    if (i > 0 && !isHttp(current)) throw new Error(`Redirection non http(s): ${current.host}`);
    // A chaque saut (cible initiale signee comprise) : jamais d'IP interne/LAN.
    if (isBlockedHost(current.hostname)) throw new Error(`Hote non autorise: ${current.host}`);
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
function transcodeToFragmentedMp4(sourceStream, res, live = false) {
  // Live (.ts direct) : REMUX video en `copy` — le flux Live est quasi toujours
  // en H.264, deja lisible par Chrome/Edge. Copy = quasi zero CPU et une seule
  // connexion continue (respecte max_connections:1). Un libx264 temps reel sur
  // le Live saturait le CPU -> stalls -> timeout du lecteur (regression 9c3a789).
  // Safari lit le Live en HLS m3u8 (segments passthrough), pas par ce chemin.
  // VOD non-native (MKV/HEVC) : on garde VIDEO_CODEC (libx264 par defaut) car le
  // conteneur peut etre du HEVC/10-bit que Safari refuse en <video>.
  const videoCodec = live ? 'copy' : VIDEO_CODEC;
  const args = [
    '-hide_banner', '-loglevel', 'error', '-nostdin',
    // Live : flags basse latence (démarrage + zapping plus rapides).
    ...(live
      ? ['-fflags', 'nobuffer+genpts', '-flags', 'low_delay', '-probesize', '1000000', '-analyzeduration', '1000000']
      : ['-fflags', '+genpts']),
    '-i', 'pipe:0',
    '-map', '0:v:0', '-map', '0:a:0?',
    '-c:v', videoCodec,
    ...(videoCodec === 'libx264' ? ['-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p'] : []),
    '-c:a', 'aac', '-b:a', '160k', '-ac', '2',
    ...(live ? ['-flush_packets', '1'] : []),
    // fMP4 fragmente (moov en tete). PAS de +faststart : invalide sur une sortie
    // en pipe non-seekable, ca produisait un flux illisible par Safari.
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
  // Gestion des deconnexions a chaque maillon (client, ffmpeg, upstream).
  res.on('error', cleanup);
  res.once('close', cleanup);
  ff.stdin.on('error', () => {}); // EPIPE si ffmpeg se ferme avant la fin de l'entree
  ff.stdout.on('error', cleanup);
  ff.stderr.on('data', () => {}); // ne journalise aucune URL
  sourceStream.on('error', cleanup);

  sourceStream.pipe(ff.stdin);
  ff.stdout.pipe(res);
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
    const { target, trusted, viaSig } = targetFor(req);
    if (!trusted) {
      clearTimeout(headerTimer);
      return void res.writeHead(403, { 'content-type': 'text/plain' }).end('Hote non autorise.');
    }

    // Candidat au transcodage = film MKV/AVI OU flux live .ts DIRECT (pas un
    // segment HLS signe). Pour ceux-la on n'envoie PAS de Range : le live .ts
    // refuse le Range (405) et le transcode est progressif de toute facon.
    const rawTarget = target.toString();
    const transcodeCandidate = !viaSig && (UNSUPPORTED_EXT.test(rawTarget) || /\.ts(?:$|[?#])/i.test(rawTarget));

    // UA player + Range (seek passthrough mp4). On ne transmet PAS l'UA navigateur.
    const headers = new Headers({ 'user-agent': UPSTREAM_UA, accept: '*/*' });
    const range = req.headers.range;
    if (typeof range === 'string' && !transcodeCandidate) headers.set('range', range);

    const { response, finalUrl } = await fetchAllowed(
      target,
      { method: req.method, headers, signal: aborter.signal },
      trusted,
    );
    clearTimeout(headerTimer);

    const contentType = response.headers.get('content-type') ?? '';
    const urlStr = finalUrl.toString();
    const originalStr = target.toString(); // le CDN masque souvent l'extension apres redirection
    const isPlaylist = /mpegurl/i.test(contentType) || /\.m3u8(?:$|[?#])/i.test(urlStr);
    // Flux live .ts DIRECT (une seule connexion continue) -> transcode ; mais un
    // segment .ts HLS signe (viaSig) doit passer tel quel.
    const isDirectTs = !viaSig && (/\.ts(?:$|[?#])/i.test(originalStr) || /mp2t/i.test(contentType));
    const needsTranscode =
      TRANSCODE &&
      req.method === 'GET' &&
      !isPlaylist &&
      response.body !== null &&
      (UNSUPPORTED_EXT.test(originalStr) || UNSUPPORTED_EXT.test(urlStr) || UNSUPPORTED_CT.test(contentType) || isDirectTs);

    if (needsTranscode) {
      return void transcodeToFragmentedMp4(Readable.fromWeb(response.body), res, isDirectTs);
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
    const body = Readable.fromWeb(response.body);
    body.on('error', () => res.destroy());
    res.on('error', () => body.destroy());
    res.once('close', () => body.destroy());
    body.pipe(res);
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
