import type { ReactNode } from 'react';

/** Icones inline (trait, currentColor) — pas de dependance icone. */

function Svg({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className ?? 'h-5 w-5'}
    >
      {children}
    </svg>
  );
}

interface IconProps {
  className?: string;
}

export const IconHome = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V21h14V9.5" />
    <path d="M9 21v-6h6v6" />
  </Svg>
);

export const IconTv = ({ className }: IconProps) => (
  <Svg className={className}>
    <rect x="3" y="7" width="18" height="13" rx="2" />
    <path d="m8 2 4 4 4-4" />
  </Svg>
);

export const IconFilm = ({ className }: IconProps) => (
  <Svg className={className}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4" />
  </Svg>
);

export const IconSeries = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="m12 3 9 5-9 5-9-5 9-5z" />
    <path d="m3 13 9 5 9-5" />
  </Svg>
);

export const IconHeart = ({ className, filled = false }: IconProps & { filled?: boolean }) => (
  <svg
    viewBox="0 0 24 24"
    fill={filled ? 'currentColor' : 'none'}
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
    className={className ?? 'h-5 w-5'}
  >
    <path d="M12 20.5s-7.4-4.6-9.6-9C.9 8.2 3 5 6.4 5c2.2 0 3.9 1.2 5.6 3.3C13.7 6.2 15.4 5 17.6 5 21 5 23.1 8.2 21.6 11.5c-2.2 4.4-9.6 9-9.6 9z" />
  </svg>
);

export const IconSettings = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M4 7h16M4 17h16" />
    <circle cx="9" cy="7" r="2.5" />
    <circle cx="15" cy="17" r="2.5" />
  </Svg>
);

export const IconSearch = ({ className }: IconProps) => (
  <Svg className={className}>
    <circle cx="11" cy="11" r="6" />
    <path d="m20 20-3.5-3.5" />
  </Svg>
);

export const IconArrowLeft = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M19 12H5" />
    <path d="m11 18-6-6 6-6" />
  </Svg>
);

export const IconChevronDown = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="m6 9 6 6 6-6" />
  </Svg>
);

export const IconX = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
);

export const IconEyeOff = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z" />
    <circle cx="12" cy="12" r="2.5" />
    <path d="M4 4l16 16" />
  </Svg>
);

export const IconDownload = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M12 4v10m0 0 4-4m-4 4-4-4" />
    <path d="M4 19h16" />
  </Svg>
);

export const IconRefresh = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M20 12a8 8 0 1 1-2.34-5.66" />
    <path d="M20 4v4h-4" />
  </Svg>
);

export const IconTrash = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M4 7h16" />
    <path d="M9 7V5h6v2" />
    <path d="m6 7 1 13h10l1-13" />
  </Svg>
);

export const IconPlay = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className ?? 'h-5 w-5'}>
    <path d="M8 5v14l11-7-11-7z" />
  </svg>
);
