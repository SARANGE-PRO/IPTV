/**
 * Regles de reprise VOD/episode (pures, sans effet de bord). La persistance
 * reelle passe par playbackStore/playbackRepository — ce service ne fait que
 * decider quand proposer/masquer la reprise et quand marquer "termine".
 */

const MIN_RESUME_SECONDS = 30;
/** Seuil unique "termine" (source de verite, reutilise par playbackStore) : au
 *  dela, on marque termine et on ne propose plus la reprise. */
export const FINISHED_RATIO = 0.92;

/** Proposer "Reprendre" si la position est significative et pas quasi finie. */
export function shouldOfferResume(positionSec: number, durationSec: number | null): boolean {
  if (positionSec <= MIN_RESUME_SECONDS) return false;
  if (durationSec !== null && durationSec > 0 && positionSec / durationSec >= FINISHED_RATIO) return false;
  return true;
}

/** Considere comme termine au-dela du seuil (quand la duree est connue). */
export function isFinishedByRatio(positionSec: number, durationSec: number | null): boolean {
  return durationSec !== null && durationSec > 0 && positionSec / durationSec >= FINISHED_RATIO;
}

/** Ratio 0..1 borne, ou null si la duree est inconnue. */
export function progressRatio(positionSec: number, durationSec: number | null): number | null {
  if (durationSec === null || durationSec <= 0) return null;
  return Math.min(1, Math.max(0, positionSec / durationSec));
}
