import { canonicalChannelKey } from '@/services/live/channelNormalizer';
import { clearbitLogo } from '@/services/live/clearbitLogoProvider';
import { iptvOrgLogo } from '@/services/live/iptvOrgLogoProvider';
import type { LogoCandidate } from '@/types/channelLogo';
import type { BoolNum, LiveChannel } from '@/types/models';

/**
 * Orchestration de resolution de logo de chaine. Ordre :
 *   1. logo IPTV/Xtream (stream_icon) — source principale ;
 *   2. si le logo IPTV echoue ET chaine FR : IPTV-Org (point d'extension) ;
 *   3. puis Clearbit si le domaine FR est connu ;
 *   4. sinon monogramme premium (gere par le composant).
 *
 * Les fallbacks 2/3 ne sont que des URLs d'images : aucune requete reseau
 * declenchee ici, aucune dependance bloquante. Non-FR : IPTV puis monogramme.
 */

export function primaryLogoUrl(channel: Pick<LiveChannel, 'logoUrl'>): string | null {
  return channel.logoUrl !== null && channel.logoUrl !== '' ? channel.logoUrl : null;
}

/** Candidats de repli (hors IPTV) — uniquement pour les chaines FR connues. */
export function fallbackLogoCandidates(
  channel: Pick<LiveChannel, 'name'> & { isFrench?: BoolNum },
): LogoCandidate[] {
  if (channel.isFrench !== 1) return [];
  const key = canonicalChannelKey(channel.name);
  const candidates: LogoCandidate[] = [];
  const org = iptvOrgLogo(key);
  if (org !== null) candidates.push({ url: org, source: 'iptv-org' });
  const clearbit = clearbitLogo(key);
  if (clearbit !== null) candidates.push({ url: clearbit, source: 'clearbit' });
  return candidates;
}
