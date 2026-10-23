import type { ReactNode } from 'react';

/**
 * Entree douce de chaque page (fondu + leger glissement), comme une app
 * native. `animate-page-in` n'applique la transformation QUE pendant
 * l'animation (fill « backwards ») : une fois terminee, aucun `transform` ne
 * reste sur le conteneur — sinon le plein ecran paysage du lecteur
 * (`position: fixed`) se calerait sur la page au lieu de l'ecran.
 * Respecte « reduire les animations » (globals.css).
 */
export function PageTransition({ children }: { children: ReactNode }) {
  return <div className="animate-page-in">{children}</div>;
}
