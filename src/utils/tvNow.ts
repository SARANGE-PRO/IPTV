import type { TvNow, TvSlot } from '@/types/tvGuide';

/**
 * Programme en cours d'une chaine a l'instant `nowMs` (creneaux tries, en
 * minutes) — brique PURE. null : rien a l'antenne d'apres le guide.
 */
export function tvNowFor(slots: readonly TvSlot[] | undefined, nowMs: number): TvNow | null {
  if (slots === undefined) return null;
  const nowMin = nowMs / 60_000;
  for (let i = 0; i < slots.length; i += 1) {
    const [start, end, title] = slots[i]!;
    if (start <= nowMin && nowMin < end) {
      const next = slots[i + 1];
      return {
        title,
        start: start * 60_000,
        end: end * 60_000,
        // Suivant annonce seulement s'il enchaine (pas apres un trou du guide).
        nextTitle: next !== undefined && next[0] - end <= 1 ? next[2] : null,
      };
    }
    if (start > nowMin) break;
  }
  return null;
}

/** Avancement 0..1 du programme. */
export function tvProgress(now: TvNow, nowMs: number): number {
  const span = now.end - now.start;
  return span > 0 ? Math.min(1, Math.max(0, (nowMs - now.start) / span)) : 0;
}
