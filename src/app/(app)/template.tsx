import type { ReactNode } from 'react';

/**
 * Template App Router : re-monte a chaque navigation entre pages -> transition
 * douce (fondu + leger glissement). N'englobe PAS le slot @modal (parallel
 * route), donc l'ouverture d'un detail en modal ne re-anime pas l'arriere-plan.
 * Respecte prefers-reduced-motion (globals.css neutralise l'animation).
 */
export default function AppTemplate({ children }: { children: ReactNode }) {
  return <div className="animate-fade-in">{children}</div>;
}
