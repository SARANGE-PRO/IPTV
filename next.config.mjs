/**
 * Deux cibles de deploiement, meme code :
 *  - Vercel (HTTPS, defaut) : rien a configurer.
 *  - Coquille HTTP pure (infra/http-shell, Docker) : NEXT_OUTPUT=standalone pour
 *    produire un serveur autonome, et NEXT_PUBLIC_PLAIN_HTTP=1 pour retirer
 *    `upgrade-insecure-requests` (sinon le navigateur forcerait les flux video
 *    HTTP en HTTPS, que le serveur Xtream ne parle pas).
 */
const PLAIN_HTTP_SHELL = process.env.NEXT_PUBLIC_PLAIN_HTTP === '1';
/** `standalone` (Docker) ou `export` (coquille statique, scripts/build-static.mjs). */
const OUTPUT = process.env.NEXT_OUTPUT === 'standalone' || process.env.NEXT_OUTPUT === 'export' ? process.env.NEXT_OUTPUT : undefined;
/**
 * Origine de la coquille statique autorisee a appeler /api/* (ex.
 * `http://tv.exemple.fr`). Defini sur Vercel UNIQUEMENT quand la coquille
 * GitHub Pages est en service ; vide = aucun CORS (meme origine seulement).
 */
const CORS_ALLOWED_ORIGIN = process.env.CORS_ALLOWED_ORIGIN?.trim().replace(/\/+$/, '') ?? '';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Vercel n'a pas besoin de `output` ; Docker -> standalone, GitHub Pages -> export.
  ...(OUTPUT !== undefined ? { output: OUTPUT } : {}),
  // Export statique : /movies -> out/movies/index.html (servi tel quel par
  // n'importe quel hebergeur de fichiers, GitHub Pages compris).
  ...(OUTPUT === 'export' ? { trailingSlash: true } : {}),

  // Export statique : aucun serveur, les en-tetes ne s'appliquent pas (Next
  // avertirait si la fonction etait presente).
  ...(OUTPUT === 'export' ? {} : { headers, redirects }),

  // ESLint sera recablé proprement a une etape ulterieure ; on ne bloque pas
  // le build dessus pour l'instant (le type-check TS strict reste actif).
  eslint: { ignoreDuringBuilds: true },

  images: {
    // Posters / backdrops TMDB (etape 9). Les flux video ne passent JAMAIS ici.
    remotePatterns: [
      { protocol: 'https', hostname: 'image.tmdb.org' },
    ],
  },
};

/**
 * Anciennes URL a segment dynamique (`/movies/123`, PWA installees, rappels
 * de notification deja programmes) -> nouveau routage par parametre (voir
 * utils/appRoutes.ts). Ids numeriques seulement : `/live/watch` n'est pas touche.
 * Serveur uniquement (ignore en export statique).
 * @returns {Promise<Array<{ source: string; destination: string; permanent: boolean }>>}
 */
async function redirects() {
  return [
    { source: '/movies/:id(\\d+)', destination: '/movies?vod=:id', permanent: true },
    { source: '/series/:id(\\d+)', destination: '/series?series=:id', permanent: true },
    { source: '/live/:id(\\d+)', destination: '/live/watch?id=:id', permanent: true },
  ];
}

/** @returns {Promise<Array<{ source: string; headers: Array<{ key: string; value: string }> }>>} */
async function headers() {
  {
    // Durcissement SANS risque fonctionnel : anti-clickjacking (frame-ancestors +
    // X-Frame-Options), anti-sniffing, referrer minimal. On garde
    // `upgrade-insecure-requests` (mixed-content), SAUF en coquille HTTP pure ou
    // il casserait la lecture directe. On n'ajoute PAS de `script-src`/
    // `connect-src`/`media-src` restrictif : mal calibre il casserait hls.js et la
    // passerelle media, pour un gain XSS faible (React echappe, aucun
    // dangerouslySetInnerHTML/eval dans le code).
    const csp = PLAIN_HTTP_SHELL
      ? "frame-ancestors 'none'"
      : "frame-ancestors 'none'; upgrade-insecure-requests";
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
        ],
      },
      // CORS pour la coquille statique (page HTTP sur une autre origine). Une
      // seule origine, jamais `*` : /api/xtream relaie des identifiants. Les
      // routes POST exposent un handler OPTIONS (preflight) qui recoit ces
      // memes en-tetes.
      ...(CORS_ALLOWED_ORIGIN !== ''
        ? [
            {
              source: '/api/:path*',
              headers: [
                { key: 'Access-Control-Allow-Origin', value: CORS_ALLOWED_ORIGIN },
                { key: 'Access-Control-Allow-Methods', value: 'GET, POST, OPTIONS' },
                { key: 'Access-Control-Allow-Headers', value: 'Content-Type' },
                { key: 'Access-Control-Max-Age', value: '86400' },
                { key: 'Vary', value: 'Origin' },
              ],
            },
          ]
        : []),
    ];
  }
}

export default nextConfig;
