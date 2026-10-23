/**
 * Politique de REPRISE automatique d'un flux — module PUR (aucun DOM, aucun
 * import) : il decide combien de relances, a quel rythme et avec quels delais
 * de garde ; le lecteur (VideoPlayer) l'applique.
 *
 * En IPTV (Xtream), la plupart des echecs sont TRANSITOIRES : connexion pas
 * encore liberee par le serveur apres un zapping (compte a connexion unique),
 * playlist Live qui cesse d'avancer, reseau mobile qui bascule wifi/4G,
 * passerelle qui hoquete. Une relance espacee les absorbe sans que
 * l'utilisateur ne voie jamais d'ecran d'erreur.
 */

export type StreamKind = 'live' | 'vod';

/** Ce qui declenche une relance (sert aussi au diagnostic). */
export type RecoveryReason = 'error' | 'timeout' | 'stall' | 'ended';

/** MediaError.code des <video> : 1 abort, 2 reseau, 3 decodage, 4 source non lue. */
const MEDIA_ERR_ABORTED = 1;
const MEDIA_ERR_SRC_NOT_SUPPORTED = 4;

/**
 * Delais (ms) avant chaque relance d'un MEME incident. Live : plus nerveux
 * (une chaine figee se voit tout de suite) ; le 2e palier laisse au serveur
 * le temps de liberer la connexion precedente apres un zapping.
 */
const RETRY_DELAYS: Record<StreamKind, readonly number[]> = {
  live: [800, 2500, 5000],
  vod: [1000, 3000, 6000],
};

/** Lecture saine pendant ce temps : l'incident est clos, le compteur repart a 0. */
export const HEALTHY_RESET_MS = 30_000;

/**
 * Prolongation UNIQUE du delai de demarrage quand le flux donne des signes de
 * vie (metadonnees, donnees recues) mais tarde : un flux lent n'est pas mort,
 * le relancer le ferait repartir de zero.
 */
export const STARTUP_GRACE_MS = 15_000;

/**
 * Direct en pause (ou suspendu par iOS en arriere-plan) au-dela de ce delai :
 * a la reprise on RECHARGE pour rejoindre le direct. Les playlists Xtream ont
 * une fenetre courte : reprendre au point de pause tombe hors fenetre (gel).
 */
export const LIVE_REJOIN_AFTER_MS = 30_000;

/** Periode du chien de garde anti-gel. */
export const WATCHDOG_INTERVAL_MS = 1000;

/** Relance n° `retriesSoFar` (0 = premiere) : delai en ms, ou null = abandon. */
export function retryDelay(kind: StreamKind, retriesSoFar: number): number | null {
  return RETRY_DELAYS[kind][retriesSoFar] ?? null;
}

/**
 * Nombre de relances autorisees pour un incident.
 *  - Live : toujours 3 (un direct qui decroche se recupere presque toujours).
 *  - VOD : `aborted` = arret volontaire, rien a relancer ; `source non lue`
 *    AVANT tout demarrage = souvent un vrai format illisible (une seule
 *    tentative de plus, au cas ou c'etait une limite de connexions) ; le
 *    reste (reseau, decodage, gel) = 3.
 */
export function recoveryBudget(kind: StreamKind, mediaErrorCode: number | null, started: boolean): number {
  if (kind === 'live') return RETRY_DELAYS.live.length;
  if (mediaErrorCode === MEDIA_ERR_ABORTED) return 0;
  if (mediaErrorCode === MEDIA_ERR_SRC_NOT_SUPPORTED && !started) return 1;
  return RETRY_DELAYS.vod.length;
}

/** Delai max sans signe de vie au demarrage (avant prolongation eventuelle). */
export function startupTimeout(kind: StreamKind, retriesSoFar: number): number {
  if (kind === 'live') return retriesSoFar === 0 ? 15_000 : 12_000;
  return retriesSoFar === 0 ? 40_000 : 30_000;
}

/**
 * Temps sans progression (lecture demandee, onglet visible) au-dela duquel
 * le flux est considere gele. Un seek VOD sur un serveur lent a droit a plus.
 */
export function stallTimeout(kind: StreamKind, seeking: boolean): number {
  if (kind === 'live') return 10_000;
  return seeking ? 45_000 : 25_000;
}

/**
 * Position a laquelle reprendre une VOD rechargee : la derniere position
 * connue si elle depasse sensiblement le point de depart, sinon le depart.
 */
export function resumePosition(startAt: number, lastKnown: number | null): number {
  if (lastKnown !== null && lastKnown > startAt + 2) return lastKnown;
  return startAt;
}
