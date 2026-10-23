import type { ReactNode } from 'react';

/** Icones d'actions d'organisation (onglets, rangement, tri) — trait, currentColor. */

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

export const IconMore = ({ className }: IconProps) => (
  <Svg className={className}>
    <circle cx="5.5" cy="12" r="1.2" fill="currentColor" />
    <circle cx="12" cy="12" r="1.2" fill="currentColor" />
    <circle cx="18.5" cy="12" r="1.2" fill="currentColor" />
  </Svg>
);

export const IconPlus = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);

export const IconFolder = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4.4l2 2h8.6A1.5 1.5 0 0 1 21 9.5v8A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5z" />
  </Svg>
);

export const IconGrip = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M5 9h14M5 15h14" />
  </Svg>
);

export const IconPencil = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M4 20h4L19 9l-4-4L4 16z" />
    <path d="m13.5 6.5 4 4" />
  </Svg>
);

export const IconClock = ({ className }: IconProps) => (
  <Svg className={className}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Svg>
);

export const IconChevronLeft = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="m15 6-6 6 6 6" />
  </Svg>
);

export const IconChevronRight = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="m9 6 6 6-6 6" />
  </Svg>
);

/** Diffuser sur la TV (Cast) : ecran, ondes en bas a gauche. */
export const IconCast = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M3 8V6.5A1.5 1.5 0 0 1 4.5 5h15A1.5 1.5 0 0 1 21 6.5v11a1.5 1.5 0 0 1-1.5 1.5H14" />
    <path d="M3 12.2a6.8 6.8 0 0 1 6.8 6.8" />
    <path d="M3 15.6a3.4 3.4 0 0 1 3.4 3.4" />
    <circle cx="3.6" cy="18.4" r="0.6" fill="currentColor" />
  </Svg>
);
