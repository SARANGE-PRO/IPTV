/**
 * Deux cibles de deploiement, meme code :
 *  - Vercel (HTTPS, defaut) : rien a configurer.
 *  - Coquille HTTP pure (infra/http-shell, Docker) : NEXT_OUTPUT=standalone pour
 *    produire un serveur autonome, et NEXT_PUBLIC_PLAIN_HTTP=1 pour retirer
 *    `upgrade-insecure-requests` (sinon le navigateur forcerait les flux video
 *    HTTP en HTTPS, que le serveur Xtream ne parle pas).
 */
const PLAIN_HTTP_SHELL = process.env.NEXT_PUBLIC_PLAIN_HTTP === '1';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Vercel n'a pas besoin de `standalone` ; on ne l'active que pour Docker.
  ...(process.env.NEXT_OUTPUT === 'standalone' ? { output: 'standalone' } : {}),

  async headers() {
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
    ];
  },

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

export default nextConfig;
