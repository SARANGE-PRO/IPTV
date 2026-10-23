/**
 * Guide TV des chaines FRANCAISES (xmltvfr), servi par `/api/tvguide` pour la
 * liste Live (programme en cours sous chaque chaine). Format compact : un
 * creneau = [debut, fin, titre], heures en MINUTES depuis l'epoch.
 */
export type TvSlot = [startMin: number, endMin: number, title: string];

export interface TvSchedule {
  fetchedAt: number;
  /** Cle = nom du referentiel des chaines FR (« France 2 »), = LineupGroup.name. */
  channels: Record<string, TvSlot[]>;
}

export interface TvNow {
  title: string;
  start: number;
  end: number;
  /** Programme suivant (titre), s'il est connu. */
  nextTitle: string | null;
}
