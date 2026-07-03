/*
 * Service worker minimal — app shell only.
 *
 * NE MET JAMAIS EN CACHE :
 *  - les flux video (autre origine que l'app : serveur Xtream) ;
 *  - les appels API (/api/*) : metadonnees Xtream, TMDB, credentials ;
 *  - toute requete non-GET ou cross-origin.
 *
 * Ne cache que les assets statiques de MEME origine (build Next, icones,
 * manifest). Navigation : reseau d'abord, fallback page offline.
 */

// Incremente quand une icone/ressource precachee change : les PWA deja
// installees ne doivent pas conserver l'ancienne identite visuelle.
const CACHE = 'zibtv-shell-v3';
const OFFLINE_URL = '/offline.html';
const PRECACHE = [
  '/offline.html',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/brand/zibtv-mark.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function isCacheableAsset(url) {
  return (
    url.origin === self.location.origin &&
    (url.pathname.startsWith('/_next/static/') ||
      url.pathname.startsWith('/icons/') ||
      url.pathname.startsWith('/brand/') ||
      url.pathname === '/manifest.webmanifest' ||
      url.pathname === '/apple-touch-icon.png')
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Jamais l'API ni le cross-origin (flux video, images distantes, TMDB img).
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  // Navigations : reseau d'abord, page offline en secours.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  // Assets statiques : cache d'abord, sinon reseau (et on alimente le cache).
  if (isCacheableAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((cache) => cache.put(request, copy));
            }
            return res;
          }),
      ),
    );
  }
});
