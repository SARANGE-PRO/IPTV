/** Provenance d'un logo de chaine resolu. */
export type LogoSource = 'xtream' | 'iptv-org' | 'clearbit' | 'none';

export interface LogoCandidate {
  url: string;
  source: LogoSource;
}
