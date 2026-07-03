/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

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
