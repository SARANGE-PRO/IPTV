import * as settingsRepository from '@/db/repositories/settingsRepository';

/**
 * Mode « connexion faible » : la connexion sert UNIQUEMENT a ce qui joue.
 * Les taches de fond (enrichissement TMDB, synchro, guide TV, EPG, scores,
 * recommandations, rotations d'images) consultent `isLowBandwidth()` et se
 * mettent en pause ; elles reprennent seules a la sortie du mode.
 *
 * Actif jusqu'a desactivation, OU apres 3 h sans aucune lecture (sinon on le
 * retrouverait allume le lendemain, a la maison, sans raison).
 *
 * Proposition automatique : seulement sur une lecture VRAIMENT degradee
 * (`shouldPropose`, pure et testee), une fois par session si refusee.
 */

const SETTING_KEY = 'lowBandwidth';
/** Sans lecture depuis ce delai, le mode s'eteint. */
export const LOW_BANDWIDTH_IDLE_OFF_MS = 3 * 60 * 60_000;
/** Ecriture de « derniere lecture » au plus toutes les... */
const TOUCH_WRITE_MS = 5 * 60_000;

interface Stored {
  on: boolean;
  lastPlaybackAt: number;
}

let enabled = false;
let lastPlaybackAt = 0;
let lastWriteAt = 0;
let proposal = false;
let proposalDeclined = false;
const listeners = new Set<() => void>();
let waiters: (() => void)[] = [];

function emit(): void {
  for (const listener of listeners) listener();
  if (!enabled) {
    const ready = waiters;
    waiters = [];
    for (const resolve of ready) resolve();
  }
}

function persist(): void {
  lastWriteAt = Date.now();
  void settingsRepository
    .setSetting<Stored>(SETTING_KEY, { on: enabled, lastPlaybackAt })
    .catch(() => undefined);
}

export function isLowBandwidth(): boolean {
  return enabled;
}

export function subscribeLowBandwidth(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Relit l'etat enregistre (demarrage) ; eteint le mode s'il a « vieilli ». */
export async function hydrateLowBandwidth(now: number = Date.now()): Promise<void> {
  const stored = await settingsRepository.getSetting<Stored>(SETTING_KEY).catch(() => undefined);
  if (stored === undefined) return;
  lastPlaybackAt = stored.lastPlaybackAt;
  const next = stored.on && now - stored.lastPlaybackAt < LOW_BANDWIDTH_IDLE_OFF_MS;
  if (next !== enabled) {
    enabled = next;
    emit();
  }
  if (stored.on && !next) persist();
}

export function setLowBandwidth(on: boolean): void {
  if (on) {
    proposal = false;
    lastPlaybackAt = Date.now();
  }
  if (on === enabled) {
    emit();
    return;
  }
  enabled = on;
  persist();
  emit();
}

/** Une lecture est en cours : repousse l'extinction automatique. */
export function touchLowBandwidth(now: number = Date.now()): void {
  lastPlaybackAt = now;
  if (enabled && now - lastWriteAt >= TOUCH_WRITE_MS) persist();
}

/** Se resout quand la connexion est de nouveau libre (immediatement hors mode). */
export function whenBandwidthAllows(): Promise<void> {
  if (!enabled) return Promise.resolve();
  return new Promise((resolve) => waiters.push(resolve));
}

// --- Proposition automatique ---------------------------------------------------

/** Fenetre et seuil : 3 incidents de tampon/gel en 5 min de lecture. */
const PROPOSE_WINDOW_MS = 5 * 60_000;
const PROPOSE_INCIDENTS = 3;

/**
 * Faut-il proposer le mode ? Jamais au moindre ralentissement : il faut
 * plusieurs incidents rapproches OU une lecture abandonnee apres ses relances
 * pour cause reseau.
 */
export function shouldPropose(input: {
  incidents: readonly number[];
  networkFailure: boolean;
  now: number;
  enabled: boolean;
  declined: boolean;
}): boolean {
  if (input.enabled || input.declined) return false;
  if (input.networkFailure) return true;
  const recent = input.incidents.filter((t) => input.now - t <= PROPOSE_WINDOW_MS).length;
  return recent >= PROPOSE_INCIDENTS;
}

/** Appele par la qualite reseau a chaque incident ou echec reseau. */
export function considerProposal(incidents: readonly number[], networkFailure: boolean): void {
  if (proposal) return;
  if (!shouldPropose({ incidents, networkFailure, now: Date.now(), enabled, declined: proposalDeclined })) return;
  proposal = true;
  emit();
}

export function isProposed(): boolean {
  return proposal;
}

/** « Non merci » : plus de proposition jusqu'au prochain lancement. */
export function declineProposal(): void {
  proposal = false;
  proposalDeclined = true;
  emit();
}
