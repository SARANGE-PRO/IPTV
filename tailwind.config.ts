import type { Config } from 'tailwindcss';

/**
 * Palette premium sombre : noir profond facon Apple TV + accent rouge Netflix.
 * Surfaces = `ink`, accent = `accent`, texte = `fg`.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
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
          faint: '#6B6B73',
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
      },
      animation: {
        'fade-in': 'fade-in 0.25s ease-out both',
        'modal-rise': 'modal-rise 0.32s cubic-bezier(0.2, 0.8, 0.2, 1) both',
      },
    },
  },
  plugins: [],
};

export default config;
