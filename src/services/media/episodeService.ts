import { FINISHED_RATIO } from '@/services/player/resumePlaybackService';
import type { Episode, PlaybackEntry } from '@/types/models';

/**
 * Regles EPISODES (pures, testables) : episode suivant, action principale de
 * la fiche serie (Reprendre / Episode suivant / Lecture), statut d'un episode.
 */

const MIN_RESUME_SECONDS = 30;

/** Episode qui suit `currentId` dans l'ordre saison/episode, sinon null. */
export function nextEpisode(episodes: readonly Episode[], currentId: string): Episode | null {
  const index = episodes.findIndex((e) => e.id === currentId);
  return index >= 0 ? (episodes[index + 1] ?? null) : null;
}

export type PrimaryMode = 'resume' | 'next' | 'start' | 'restart';

export interface PrimaryAction {
  mode: PrimaryMode;
  episode: Episode;
  /** Position de depart (s). */
  startAt: number;
  label: string;
}

export function episodeCode(ep: Episode): string {
  return `S${ep.seasonNumber} E${ep.episodeNumber}`;
}

/**
 * Bouton principal facon Netflix, d'apres l'episode le PLUS RECEMMENT joue :
 * en cours -> « Reprendre » ; termine -> « Episode suivant » (ou « Revoir »
 * si c'etait le dernier) ; rien -> « Lecture » du 1er episode.
 */
export function primaryAction(
  episodes: readonly Episode[],
  progress: ReadonlyMap<string, PlaybackEntry>,
): PrimaryAction | null {
  const first = episodes[0];
  if (first === undefined) return null;
  let last: { ep: Episode; entry: PlaybackEntry } | null = null;
  for (const ep of episodes) {
    const entry = progress.get(ep.id);
    if (entry !== undefined && (last === null || entry.updatedAt > last.entry.updatedAt)) last = { ep, entry };
  }
  if (last === null) return { mode: 'start', episode: first, startAt: 0, label: `Lecture ${episodeCode(first)}` };
  const { ep, entry } = last;
  if (entry.finished === 0 && entry.positionSec > MIN_RESUME_SECONDS) {
    return { mode: 'resume', episode: ep, startAt: entry.positionSec, label: `Reprendre ${episodeCode(ep)}` };
  }
  if (entry.finished === 0) return { mode: 'start', episode: ep, startAt: 0, label: `Lecture ${episodeCode(ep)}` };
  const next = nextEpisode(episodes, ep.id);
  if (next !== null) return { mode: 'next', episode: next, startAt: 0, label: `Épisode suivant ${episodeCode(next)}` };
  return { mode: 'restart', episode: first, startAt: 0, label: `Revoir ${episodeCode(first)}` };
}

/** Position de reprise d'un episode (0 si termine ou a peine commence). */
export function resumePosition(entry: PlaybackEntry | undefined): number {
  return entry !== undefined && entry.finished === 0 && entry.positionSec > MIN_RESUME_SECONDS ? entry.positionSec : 0;
}

/** Ratio vu 0..1 (1 si termine), null si jamais lance. */
export function watchedRatio(entry: PlaybackEntry | undefined, fallbackDuration: number | null): number | null {
  if (entry === undefined) return null;
  if (entry.finished === 1) return 1;
  const duration = entry.durationSec ?? fallbackDuration;
  if (duration === null || duration <= 0) return entry.positionSec > 0 ? 0.02 : null;
  return Math.min(FINISHED_RATIO, Math.max(0, entry.positionSec / duration));
}
