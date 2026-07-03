/** Langue/variante audio detectee d'un contenu (films/series). */
export type MediaLanguage =
  | 'VF'
  | 'VOSTFR'
  | 'MULTI'
  | 'EN'
  | 'ES'
  | 'DE'
  | 'IT'
  | 'PT'
  | 'AR'
  | 'OTHER';

/** Variante francophone mise en avant sur les cartes (null = pas de tag fiable). */
export type FrenchVariant = 'VF' | 'MULTI' | 'VOSTFR';
