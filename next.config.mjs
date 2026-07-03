/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  async headers() {
    // Durcissement SANS risque fonctionnel : anti-clickjacking (frame-ancestors +
    // X-Frame-Options), anti-sniffing, referrer minimal. On garde
    // `upgrade-insecure-requests` (mixed-content). On n'ajoute PAS de `script-src`/
    // `connect-src`/`media-src` restrictif : mal calibre il casserait hls.js et la
    // passerelle media, pour un gain XSS faible (React echappe, aucun
    // dangerouslySetInnerHTML/eval dans le code).
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: "frame-ancestors 'none'; upgrade-insecure-requests",
          },
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
