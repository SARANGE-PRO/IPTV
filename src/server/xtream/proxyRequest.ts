/**
 * Validation PURE des requetes du proxy metadonnees Xtream (`/api/xtream`).
 * Sortie de la route pour etre testee en Node (tests/xtreamProxyRequest.test.ts).
 *
 * INTERDIT aux flux video : seules les actions metadonnees ci-dessous sont
 * autorisees et seule l'URL player_api.php est construite (jamais /live,
 * /movie ou /series).
 */

/** Actions renvoyant tout un catalogue (plusieurs Mo) : timeout amont allonge. */
export const LIST_ACTIONS: ReadonlySet<string> = new Set(['get_live_streams', 'get_vod_streams', 'get_series']);

const ALLOWED_ACTIONS: ReadonlySet<string> = new Set([
  'get_live_categories',
  'get_vod_categories',
  'get_series_categories',
  'get_live_streams',
  'get_vod_streams',
  'get_series',
  'get_series_info',
  'get_vod_info',
  // EPG (programme TV) — metadonnees uniquement, jamais de flux.
  'get_short_epg',
  // EPG COMPLET d'une chaine (plusieurs jours) — pour la detection sport 7j.
  'get_simple_data_table',
]);

const ALLOWED_PARAMS: ReadonlySet<string> = new Set(['category_id', 'series_id', 'vod_id', 'stream_id', 'limit']);

export interface ProxyRequest {
  serverUrl: string;
  username: string;
  password: string;
  action?: string;
  params: Record<string, string>;
}

/**
 * Anti-SSRF (invariant #2 en defense) : le proxy ne doit relayer QUE des
 * serveurs Xtream publics, jamais le reseau interne (metadonnees cloud
 * 169.254.169.254, routeur 192.168.x, loopback...). On rejette tout hote qui
 * est une IP litterale privee/reservee ou un nom d'hote interne. La resolution
 * DNS-rebinding reste un residuel accepte (app perso), mais l'attaque directe
 * par IP interne est bloquee, et `redirect:'error'` (route) empeche le
 * contournement par redirection amont.
 */
function ipv4ToLong(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let long = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    long = long * 256 + n;
  }
  return long >>> 0;
}

const BLOCKED_IPV4_RANGES: ReadonlyArray<readonly [string, number]> = [
  ['0.0.0.0', 8], // "this host"
  ['10.0.0.0', 8],
  ['100.64.0.0', 10], // CGNAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local (metadonnees cloud)
  ['172.16.0.0', 12],
  ['192.0.0.0', 24], // affectations IETF
  ['192.168.0.0', 16],
  ['198.18.0.0', 15], // bancs de test reseau
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserve + broadcast 255.255.255.255
];

function isBlockedIpv4Long(long: number): boolean {
  return BLOCKED_IPV4_RANGES.some(([base, bits]) => {
    const baseLong = ipv4ToLong(base) ?? 0;
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return ((long & mask) >>> 0) === ((baseLong & mask) >>> 0);
  });
}

function isBlockedIpv4(ip: string): boolean {
  const long = ipv4ToLong(ip);
  return long !== null && isBlockedIpv4Long(long);
}

/**
 * IPv6 litterale -> 8 groupes de 16 bits (forme `::` developpee, fin en
 * notation pointee IPv4 acceptee). null si ce n'est pas une IPv6 valide.
 */
function parseIpv6(host: string): number[] | null {
  let h = host;
  const dotted = h.match(/^(.*:)(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (dotted !== null) {
    const long = ipv4ToLong(dotted[2] ?? '');
    if (long === null) return null;
    h = `${dotted[1] ?? ''}${(long >>> 16).toString(16)}:${(long & 0xffff).toString(16)}`;
  }
  const halves = h.split('::');
  if (halves.length > 2) return null;
  const toGroups = (part: string): number[] | null => {
    if (part === '') return [];
    const groups: number[] = [];
    for (const g of part.split(':')) {
      if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
      groups.push(parseInt(g, 16));
    }
    return groups;
  };
  const head = toGroups(halves[0] ?? '');
  const tail = halves.length === 2 ? toGroups(halves[1] ?? '') : [];
  if (head === null || tail === null) return null;
  if (halves.length === 1) return head.length === 8 ? head : null;
  const missing = 8 - head.length - tail.length;
  if (missing < 1) return null;
  return [...head, ...new Array<number>(missing).fill(0), ...tail];
}

function isBlockedIpv6(host: string): boolean {
  const g = parseIpv6(host);
  // Contient « : » sans etre une IPv6 lisible : refuse par prudence.
  if (g === null) return true;
  const [g0 = 0, g1 = 0, g2 = 0, g3 = 0, g4 = 0, g5 = 0, g6 = 0, g7 = 0] = g;
  const embedded = ((g6 << 16) | g7) >>> 0; // IPv4 dans les 32 bits de fin
  const zeroPrefix = g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0;
  if (zeroPrefix && g5 === 0) {
    // :: (non specifiee), ::1 (loopback), ::a.b.c.d (IPv4-compatible)
    return embedded <= 1 || isBlockedIpv4Long(embedded);
  }
  if (zeroPrefix && g5 === 0xffff) return isBlockedIpv4Long(embedded); // ::ffff:a.b.c.d
  if (g0 === 0x64 && g1 === 0xff9b && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) {
    return isBlockedIpv4Long(embedded); // NAT64 64:ff9b::/96
  }
  if (g0 === 0x2002) return isBlockedIpv4Long(((g1 << 16) | g2) >>> 0); // 6to4
  if ((g0 & 0xfe00) === 0xfc00) return true; // fc00::/7 (ULA)
  if ((g0 & 0xffc0) === 0xfe80) return true; // fe80::/10 (link-local)
  if ((g0 & 0xff00) === 0xff00) return true; // ff00::/8 (multicast)
  return false;
}

/** `hostname` tel que renvoye par `new URL()` (IPv6 ENTRE CROCHETS). */
export function isBlockedHost(hostname: string): boolean {
  let h = hostname.toLowerCase().replace(/\.$/, '');
  if (h.startsWith('[') && h.endsWith(']')) h = h.slice(1, -1);
  if (h === '') return true;
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  if (h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (isBlockedIpv4(h)) return true;
  if (h.includes(':') && isBlockedIpv6(h)) return true;
  return false;
}

export function parseRequest(value: unknown): ProxyRequest | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.serverUrl !== 'string' || typeof v.username !== 'string' || typeof v.password !== 'string') {
    return null;
  }
  if (v.serverUrl === '' || v.username === '' || v.password === '') return null;

  let action: string | undefined;
  if (v.action !== undefined) {
    if (typeof v.action !== 'string' || !ALLOWED_ACTIONS.has(v.action)) return null;
    action = v.action;
  }

  const params: Record<string, string> = {};
  if (v.params !== undefined) {
    if (typeof v.params !== 'object' || v.params === null) return null;
    for (const [key, val] of Object.entries(v.params)) {
      if (!ALLOWED_PARAMS.has(key)) return null;
      if (typeof val !== 'string' && typeof val !== 'number') return null;
      params[key] = String(val);
    }
  }

  return { serverUrl: v.serverUrl, username: v.username, password: v.password, action, params };
}

/**
 * Construit l'URL player_api.php — seul endpoint Xtream jamais appele ici.
 * `allowedHosts` non vide = seuls ces hotes sont relayes (XTREAM_ALLOWED_HOSTS).
 */
export function buildApiUrl(req: ProxyRequest, allowedHosts: ReadonlySet<string> = new Set()): URL | null {
  let base: URL;
  try {
    base = new URL(req.serverUrl);
  } catch {
    return null;
  }
  if (base.protocol !== 'http:' && base.protocol !== 'https:') return null;
  if (isBlockedHost(base.hostname)) return null;
  if (allowedHosts.size > 0 && !allowedHosts.has(base.hostname.toLowerCase())) return null;

  const path = base.pathname.replace(/\/+$/, '');
  const url = new URL(`${path}/player_api.php`, base.origin);
  url.searchParams.set('username', req.username);
  url.searchParams.set('password', req.password);
  if (req.action !== undefined) url.searchParams.set('action', req.action);
  for (const [key, val] of Object.entries(req.params)) url.searchParams.set(key, val);
  return url;
}
