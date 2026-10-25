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
// v4 : les chunks du build vivent dans STATIC_CACHE (borne) ; l'ancien cache
// v3, qui accumulait tous les builds, est supprime a l'activation.
const CACHE = 'zibtv-shell-v4';
// Chunks /_next/static : noms haches, un build en ajoute ~50 sans jamais
// reprendre les anciens -> on garde les plus recents seulement (quota iOS
// partage avec IndexedDB, donc avec le catalogue).
const STATIC_CACHE = 'zibtv-static-v1';
const STATIC_MAX_ENTRIES = 150;
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
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE && k !== STATIC_CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

/** Les cles d'un cache sortent dans l'ordre d'insertion : on retire les plus anciennes. */
function trimCache(name, max) {
  return caches.open(name).then((cache) =>
    cache.keys().then((keys) => Promise.all(keys.slice(0, Math.max(0, keys.length - max)).map((k) => cache.delete(k)))),
  );
}

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

// --- Notifications / rappels --------------------------------------------------
// Clic sur une notification : focus l'onglet PWA existant (ou en ouvre un) et
// navigue vers la cible (ex. la chaine de l'evenement).
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          if ('navigate' in client) client.navigate(target).catch(() => {});
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});

// Web Push (serveur futur, opt-in) : payload JSON { title, body, url }. Sans
// serveur push configure, cet ecouteur ne se declenche jamais — inoffensif.
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }
  const title = payload.title || 'ZiBTV';
  const options = {
    body: payload.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: payload.tag,
    data: { url: payload.url || '/' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

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
              const isBuildChunk = url.pathname.startsWith('/_next/static/');
              const name = isBuildChunk ? STATIC_CACHE : CACHE;
              const stored = caches.open(name).then((cache) => cache.put(request, copy));
              if (isBuildChunk) stored.then(() => trimCache(STATIC_CACHE, STATIC_MAX_ENTRIES)).catch(() => {});
            }
            return res;
          }),
      ),
    );
  }
});
