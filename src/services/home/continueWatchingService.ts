import * as catalogRepository from '@/db/repositories/catalogRepository';
import * as playbackRepository from '@/db/repositories/playbackRepository';
import * as tmdbRepository from '@/db/repositories/tmdbRepository';
import { shouldOfferResume } from '@/services/player/resumePlaybackService';
import { tmdbBackdrop } from '@/services/tmdb/tmdbImage';
import { tmdbCacheKey } from '@/services/tmdb/tmdbMatcher';
import type { Episode, Movie, PlaybackEntry, Series, SeriesDetails } from '@/types/models';
import { movieHref, seriesHref } from '@/utils/appRoutes';
import { displayTitle } from '@/utils/displayTitle';

/**
 * « CONTINUER A REGARDER » facon Netflix (chantier P4).
 *
 *  - Une seule carte par SERIE (l'episode le plus recent), une par film.
 *  - Episode termine -> carte « Episode suivant » (si le detail de la serie est
 *    en cache local), sinon la serie disparait de la rangee.
 *  - Titre propre, « S2 · E4 », temps restant, image paysage (still d'episode,
 *    backdrop TMDB du cache, sinon affiche).
 *  - Le tap LANCE la lecture (reprise) ; une entree retiree reste masquee tant
 *    qu'on ne la relance pas (progression conservee, voir dismissedAt).
 * Lecture locale uniquement (Dexie) : aucun appel reseau.
 */

export type ContinueKind = 'movie' | 'episode' | 'next';

export type DismissTarget = { type: 'vod'; itemId: string } | { type: 'series'; seriesId: string };

export interface ContinueItem {
  key: string;
  kind: ContinueKind;
  title: string;
  /** « S2 · E4 · Reste 12 min », « Episode suivant · S2 · E5 »… */
  subtitle: string;
  /** Image paysage (still d'episode / backdrop), sinon null. */
  image: string | null;
  /** Repli : affiche verticale. */
  fallbackImage: string | null;
  /** 0..1, null si inconnu ; 0 pour « Episode suivant ». */
  progress: number | null;
  /** Lance la lecture directement. */
  href: string;
  /** Ouvre la fiche sans lancer. */
  infoHref: string;
  dismiss: DismissTarget;
}

const HISTORY_WINDOW = 120;
const EPISODE_LABEL = /S(\d+)\s*E(\d+)\s*$/i;

function remainingLabel(positionSec: number, durationSec: number | null): string | null {
  if (durationSec === null || durationSec <= 0) return null;
  const minutes = Math.max(1, Math.round((durationSec - positionSec) / 60));
  return `Reste ${minutes} min`;
}

function ratio(positionSec: number, durationSec: number | null): number | null {
  if (durationSec === null || durationSec <= 0) return null;
  return Math.min(1, Math.max(0, positionSec / durationSec));
}

function episodeCode(season: number, episode: number): string {
  return `S${season} · E${episode}`;
}

function join(...parts: (string | null)[]): string {
  return parts.filter((p): p is string => p !== null && p !== '').join(' · ');
}

/** Backdrops TMDB deja en cache (aucun appel reseau). */
async function cachedBackdrops(keys: { key: string; type: 'movie' | 'tv'; name: string }[]): Promise<Map<string, string>> {
  const entries = await tmdbRepository.getTmdbEntries(keys.map((k) => tmdbCacheKey(k.type, k.name)));
  const out = new Map<string, string>();
  for (const k of keys) {
    const data = entries.get(tmdbCacheKey(k.type, k.name))?.data ?? null;
    const url = tmdbBackdrop(data?.backdropPath ?? null, 'w780');
    if (url !== null) out.set(k.key, url);
  }
  return out;
}

interface Pick {
  entry: PlaybackEntry;
  kind: ContinueKind;
  /** Episode a lancer (resume ou suivant). */
  episode: Episode | null;
}

/**
 * Construit la rangee « Continuer a regarder » (au plus `limit` cartes), de la
 * plus recente a la plus ancienne.
 */
export async function loadContinueWatching(limit = 15): Promise<ContinueItem[]> {
  const history = (await playbackRepository.getRecentHistory(HISTORY_WINDOW)).filter(
    (e) => (e.type === 'vod' || e.type === 'episode') && !playbackRepository.isDismissed(e),
  );

  const seenVod = new Set<string>();
  const seenSeries = new Set<string>();
  const detailsCache = new Map<string, SeriesDetails | undefined>();
  const picks: Pick[] = [];

  for (const entry of history) {
    if (picks.length >= limit) break;
    if (entry.type === 'vod') {
      if (seenVod.has(entry.itemId)) continue;
      seenVod.add(entry.itemId);
      if (entry.finished === 1 || !shouldOfferResume(entry.positionSec, entry.durationSec)) continue;
      picks.push({ entry, kind: 'movie', episode: null });
      continue;
    }
    const seriesId = entry.seriesId;
    if (seriesId === null || seenSeries.has(seriesId)) continue;
    seenSeries.add(seriesId);
    if (!detailsCache.has(seriesId)) detailsCache.set(seriesId, await catalogRepository.getSeriesDetails(seriesId));
    const details = detailsCache.get(seriesId);
    const episodes = details?.episodes ?? [];
    const index = episodes.findIndex((ep) => ep.id === entry.itemId);
    const current = index >= 0 ? (episodes[index] ?? null) : null;

    if (entry.finished === 0) {
      picks.push({ entry, kind: 'episode', episode: current });
    } else {
      // Episode termine : on propose le suivant s'il existe (detail en cache).
      const next = index >= 0 ? (episodes[index + 1] ?? null) : null;
      if (next !== null) picks.push({ entry, kind: 'next', episode: next });
    }
  }
  if (picks.length === 0) return [];

  const movieIds = picks.filter((p) => p.kind === 'movie').map((p) => p.entry.itemId);
  const seriesIds = picks.filter((p) => p.kind !== 'movie').map((p) => p.entry.seriesId ?? '');
  const [movies, series] = await Promise.all([
    catalogRepository.getMoviesByIds(movieIds),
    catalogRepository.getSeriesByIds(seriesIds),
  ]);
  const movieById = new Map<string, Movie>(movies.map((m) => [m.id, m]));
  const seriesById = new Map<string, Series>(series.map((s) => [s.id, s]));

  const backdrops = await cachedBackdrops([
    ...movies.map((m) => ({ key: `vod:${m.id}`, type: 'movie' as const, name: m.name })),
    ...series.map((s) => ({ key: `series:${s.id}`, type: 'tv' as const, name: s.name })),
  ]);

  const items: ContinueItem[] = [];
  for (const { entry, kind, episode } of picks) {
    if (kind === 'movie') {
      const movie = movieById.get(entry.itemId);
      if (movie === undefined) continue; // disparu du catalogue
      items.push({
        key: `vod:${movie.id}`,
        kind,
        title: displayTitle(movie.name),
        subtitle: remainingLabel(entry.positionSec, entry.durationSec) ?? 'En cours',
        image: backdrops.get(`vod:${movie.id}`) ?? null,
        fallbackImage: movie.posterUrl ?? entry.posterUrl,
        progress: ratio(entry.positionSec, entry.durationSec),
        href: movieHref(movie.id, '', { play: true }),
        infoHref: movieHref(movie.id),
        dismiss: { type: 'vod', itemId: movie.id },
      });
      continue;
    }

    const seriesId = entry.seriesId ?? '';
    const show = seriesById.get(seriesId);
    if (show === undefined) continue;
    const labelCode = EPISODE_LABEL.exec(entry.label ?? '');
    const code =
      episode !== null
        ? episodeCode(episode.seasonNumber, episode.episodeNumber)
        : labelCode !== null
          ? episodeCode(Number(labelCode[1]), Number(labelCode[2]))
          : null;
    const seriesImage = backdrops.get(`series:${show.id}`) ?? show.backdropUrl;
    const episodeId = kind === 'next' ? (episode?.id ?? entry.itemId) : entry.itemId;
    items.push({
      key: `series:${show.id}`,
      kind,
      title: displayTitle(show.name),
      subtitle:
        kind === 'next'
          ? join('Épisode suivant', code)
          : join(code, remainingLabel(entry.positionSec, entry.durationSec)),
      image: episode?.imageUrl ?? seriesImage,
      fallbackImage: show.posterUrl ?? entry.posterUrl,
      progress: kind === 'next' ? 0 : ratio(entry.positionSec, entry.durationSec),
      href: seriesHref(show.id, '', { play: true, episodeId }),
      infoHref: seriesHref(show.id),
      dismiss: { type: 'series', seriesId: show.id },
    });
  }
  return items;
}

/** Retire une carte de la rangee (progression conservee). */
export function dismissContinue(target: DismissTarget): Promise<void> {
  return target.type === 'vod'
    ? playbackRepository.dismissEntry('vod', target.itemId)
    : playbackRepository.dismissSeries(target.seriesId);
}
