import type { ReactNode } from 'react';

/** Icones du lecteur (meme trait que components/ui/icons). */

interface IconProps {
  className?: string;
}

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

export const IconPlayFilled = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M7 4.5v15l12.5-7.5z" fill="currentColor" />
  </Svg>
);

export const IconPauseFilled = ({ className }: IconProps) => (
  <Svg className={className}>
    <rect x="6" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none" />
    <rect x="14" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none" />
  </Svg>
);
