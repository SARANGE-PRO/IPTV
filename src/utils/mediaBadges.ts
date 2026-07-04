/**
 * Badges techniques deduits du titre BRUT Xtream (souvent bourre de tags) et du
 * conteneur : qualite (4K/FHD/HD), HDR/Dolby Vision, codec (HEVC), langue
 * (MULTI/VOSTFR), format. Purement cosmetique (affichage detail premium).
 */
export type BadgeTone = 'quality' | 'hdr' | 'codec' | 'lang' | 'format';
export interface MediaBadge {
  label: string;
  tone: BadgeTone;
}

export function mediaBadges(rawName: string | null | undefined, container: string | null | undefined): MediaBadge[] {
  const n = (rawName ?? '').toLowerCase();
  const badges: MediaBadge[] = [];

  if (/\b(2160p|4k|uhd)\b/.test(n)) badges.push({ label: '4K', tone: 'quality' });
  else if (/\b(1080p|fhd)\b/.test(n)) badges.push({ label: 'FHD', tone: 'quality' });
  else if (/\b(720p|hd)\b/.test(n)) badges.push({ label: 'HD', tone: 'quality' });

  if (/\b(dolby\s?vision|dovi|dv)\b/.test(n)) badges.push({ label: 'Dolby Vision', tone: 'hdr' });
  else if (/\bhdr\s?10\+?\b|\bhdr\b/.test(n)) badges.push({ label: 'HDR', tone: 'hdr' });

  if (/\b(hevc|x265|h\.?265)\b/.test(n)) badges.push({ label: 'HEVC', tone: 'codec' });

  if (/\b(multi|vff|truefrench|vf2|vfq|vfi)\b/.test(n)) badges.push({ label: 'MULTI', tone: 'lang' });
  else if (/\bvostfr\b/.test(n)) badges.push({ label: 'VOSTFR', tone: 'lang' });

  const ext = container?.trim().toUpperCase();
  if (ext !== undefined && ext !== '') badges.push({ label: ext, tone: 'format' });

  return badges;
}

/** Classes Tailwind par tonalite (verre depoli teinte). */
export const BADGE_TONE_CLASS: Record<BadgeTone, string> = {
  quality: 'border-accent/40 bg-accent/15 text-accent',
  hdr: 'border-amber-400/40 bg-amber-400/15 text-amber-300',
  codec: 'border-sky-400/40 bg-sky-400/15 text-sky-300',
  lang: 'border-emerald-400/40 bg-emerald-400/15 text-emerald-300',
  format: 'border-ink-500/60 bg-ink-700/60 text-fg-muted',
};
