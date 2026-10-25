import type { Config } from 'tailwindcss';

/**
 * Palette premium sombre : noir profond facon Apple TV + accent rouge Netflix.
 * Surfaces = `ink`, accent = `accent`, texte = `fg`.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  // `hover:` seulement sur les appareils qui survolent vraiment (souris) : sur
  // iPhone/iPad un tap laissait l'etat de survol « colle » apres coup.
  future: { hoverOnlyWhenSupported: true },
  theme: {
    extend: {
      screens: {
        // Telephone tenu a l'horizontale (iPhone/Android, pas iPad ni fenetre
        // d'ordinateur) : le lecteur Live passe en plein ecran. DOIT rester
        // identique a PHONE_LANDSCAPE_QUERY (src/utils/videoFullscreen.ts).
        'phone-land': { raw: '(orientation: landscape) and (max-height: 500px) and (pointer: coarse)' },
        // Mini-lecteur en CARTE (tablette, ordinateur) ; un telephone a
        // l'horizontale (large mais bas) garde le bandeau compact. DOIT rester
        // identique a la requete de player/host/miniPlayer.css.
        'mini-card': { raw: '(min-width: 768px) and (min-height: 501px)' },
      },
      colors: {
        ink: {
          950: '#08080A',
          900: '#0E0E11',
          800: '#141417',
          700: '#1B1B1F',
          600: '#26262B',
          500: '#33333A',
        },
        accent: {
          DEFAULT: '#E50914',
          hover: '#F6121D',
          muted: '#B00610',
        },
        fg: {
          DEFAULT: '#F5F5F7',
          muted: '#A1A1AA',
          faint: '#83838B', // 5,3:1 sur ink-950, 4,6:1 sur ink-700 (seuil AA 4,5:1)
        },
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          'SF Pro Text',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
      borderRadius: {
        xl: '0.9rem',
        '2xl': '1.25rem',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'modal-rise': {
          from: { opacity: '0', transform: 'translateY(16px) scale(0.98)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        'page-in': {
          from: { opacity: '0', transform: 'translate3d(0, 6px, 0)' },
          to: { opacity: '1', transform: 'none' },
        },
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '20%, 60%': { transform: 'translateX(-8px)' },
          '40%, 80%': { transform: 'translateX(8px)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.25s ease-out both',
        'modal-rise': 'modal-rise 0.32s cubic-bezier(0.2, 0.8, 0.2, 1) both',
        shimmer: 'shimmer 1.6s ease-in-out infinite',
        // « backwards » : aucun transform residuel apres l'animation (voir PageTransition).
        'page-in': 'page-in 0.22s cubic-bezier(0.2, 0.8, 0.2, 1) backwards',
        shake: 'shake 0.4s ease-in-out',
      },
    },
  },
  plugins: [],
};

export default config;
