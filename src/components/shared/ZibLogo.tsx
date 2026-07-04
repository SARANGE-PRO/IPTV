import { cn } from '@/lib/cn';

/**
 * Logotype ZiBTV « rubans 3D » (vectoriel, fond transparent). Faces avant
 * lumineuses + faces arriere sombres + ombre portee -> relief. Ratio ~3.8:1,
 * dimensionne par la hauteur (ex. `h-10 w-auto`). Les ids sont prefixes `zib-`
 * pour eviter toute collision si d'autres SVG a filtres coexistent.
 */
export function ZibLogo({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 380 100"
      role="img"
      aria-label="ZiBTV"
      className={cn('block', className)}
    >
      <defs>
        <filter id="zib-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="4" stdDeviation="5" floodColor="#000000" floodOpacity="0.85" />
        </filter>
        <linearGradient id="zib-grad-front" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#FF2A35" />
          <stop offset="50%" stopColor="#E50914" />
          <stop offset="100%" stopColor="#99050D" />
        </linearGradient>
        <linearGradient id="zib-grad-back" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#73040A" />
          <stop offset="50%" stopColor="#B20710" />
          <stop offset="100%" stopColor="#3A0003" />
        </linearGradient>
        <linearGradient id="zib-grad-back-loop" x1="0%" y1="50%" x2="100%" y2="50%">
          <stop offset="0%" stopColor="#3A0003" />
          <stop offset="40%" stopColor="#80040A" />
          <stop offset="100%" stopColor="#D40812" />
        </linearGradient>
      </defs>

      {/* Pieces arriere (profondeur) */}
      <g fill="url(#zib-grad-back)">
        <polygon points="0,10 70,10 32.2,34 0,34" />
        <polygon points="24,90 70,90 70,66 37.8,66" />
        <path
          fill="url(#zib-grad-back-loop)"
          fillRule="evenodd"
          d="M 134 10 H 168 C 188 10, 198 18, 198 30 C 198 42, 188 50, 168 50 H 134 V 34 H 168 C 175 34, 178 32, 178 30 C 178 28, 175 26, 168 26 H 134 Z"
        />
        <path
          fill="url(#zib-grad-back-loop)"
          fillRule="evenodd"
          d="M 134 46 H 172 C 194 46, 204 56, 204 68 C 204 80, 194 90, 172 90 H 134 V 74 H 172 C 180 74, 184 71, 184 68 C 184 65, 180 62, 172 62 H 134 Z"
        />
        <polygon points="219,10 289,10 289,34 219,34" />
        <polygon points="350,10 374,10 351,90 327,90" />
      </g>

      {/* Pieces avant (lumineuses + ombre portee) */}
      <g fill="url(#zib-grad-front)" filter="url(#zib-shadow)">
        <polygon points="70,10 46,10 0,90 24,90" />
        <polygon points="85,10 109,10 109,28 85,28" />
        <polygon points="85,38 109,38 109,90 85,90" />
        <polygon points="124,10 148,10 148,90 124,90" />
        <polygon points="242,10 266,10 266,90 242,90" />
        <polygon points="304,10 328,10 351,90 327,90" />
      </g>
    </svg>
  );
}
