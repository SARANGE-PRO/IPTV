/** Programme EPG normalise (jamais de donnee brute/sensible cote UI). */
export interface EpgProgramme {
  title: string;
  description: string | null;
  /** Epoch ms. */
  start: number;
  end: number;
}

/** Entree de cache EPG par chaine (Dexie, TTL court). */
export interface EpgEntry {
  /** = stream_id de la chaine. */
  id: string;
  programmes: EpgProgramme[];
  fetchedAt: number;
}

export interface NowNext {
  current: EpgProgramme | null;
  next: EpgProgramme | null;
}
