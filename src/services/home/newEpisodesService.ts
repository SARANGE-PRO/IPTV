import * as catalogRepository from '@/db/repositories/catalogRepository';
import * as favoritesRepository from '@/db/repositories/favoritesRepository';
import * as playbackRepository from '@/db/repositories/playbackRepository';
import * as settingsRepository from '@/db/repositories/settingsRepository';
import { getSeriesDetailsCached } from '@/services/xtream/seriesDetailsService';
import type { Episode, Series } from '@/types/models';
import type { XtreamCredentials } from '@/types/xtream';

/**
 * « Nouveaux episodes » des series SUIVIES (commencees ou en favori). A chaque
 * synchro : une serie dont la date de mise a jour fournisseur a change est
 * relue, et ses episodes inconnus sont retenus comme nouveaux (21 jours, ou
 * jusqu'a ce qu'ils soient regardes). Photo des episodes connus = reglage
 * local ; aucune lecture reseau pour les series inchangees.
 */

const SETTING_KEY = 'followedSeriesSnapshot';
const MAX_FOLLOWED = 40;
const NEW_FOR_MS = 21 * 86_400_000;
/** Fournisseur sans date de mise a jour : relecture au plus tous les 3 jours. */
const RECHECK_MS = 3 * 86_400_000;

interface SeriesSnapshot {
  lastModifiedAt: number | null;
  checkedAt: number;
  episodeIds: string[];
  /** Episodes apparus depuis la photo precedente, et quand. */
  fresh: { id: string; at: number }[];
}

type Snapshot = Record<string, SeriesSnapshot>;

export interface NewEpisodesItem {
  series: Series;
  /** Nouveaux episodes non regardes, dans l'ordre de la serie. */
  episodes: Episode[];
}

async function followedSeriesIds(): Promise<string[]> {
  const [watched, favorites] = await Promise.all([
    playbackRepository.getWatchedSeriesIds(MAX_FOLLOWED),
    favoritesRepository.getFavoritesByType('series'),
  ]);
  return [...new Set([...watched, ...favorites.map((f) => f.itemId)])].slice(0, MAX_FOLLOWED);
}

let refreshing: Promise<void> | null = null;

/** Met a jour la photo des series suivies (apres une synchro). Ne jette jamais. */
export function refreshNewEpisodes(creds: XtreamCredentials): Promise<void> {
  refreshing ??= (async () => {
    try {
      const ids = await followedSeriesIds();
      if (ids.length === 0) return;
      const [rows, saved] = await Promise.all([
        catalogRepository.getSeriesByIds(ids),
        settingsRepository.getSetting<Snapshot>(SETTING_KEY),
      ]);
      const snapshot: Snapshot = { ...(saved ?? {}) };
      const now = Date.now();
      for (const series of rows) {
        const previous = snapshot[series.id];
        if (previous !== undefined) {
          const unchanged =
            series.lastModifiedAt !== null
              ? previous.lastModifiedAt === series.lastModifiedAt
              : now - (previous.checkedAt ?? 0) < RECHECK_MS;
          if (unchanged) continue;
        }
        // Premiere photo : episodes en cache si possible ; serie modifiee : relecture.
        const details = await getSeriesDetailsCached(creds, series.id, { force: previous !== undefined }).catch(
          () => null,
        );
        if (details === null) continue;
        const ids = details.episodes.map((e) => e.id);
        const known = new Set(previous?.episodeIds ?? ids);
        const added = previous === undefined ? [] : ids.filter((id) => !known.has(id)).map((id) => ({ id, at: now }));
        snapshot[series.id] = {
          lastModifiedAt: series.lastModifiedAt,
          checkedAt: now,
          episodeIds: ids,
          fresh: [...(previous?.fresh ?? []).filter((f) => now - f.at < NEW_FOR_MS), ...added],
        };
      }
      await settingsRepository.setSetting(SETTING_KEY, snapshot);
    } catch {
      // Jamais bloquant : la rangee reste telle quelle.
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

/** Rangee de l'accueil : series suivies avec des episodes nouveaux non regardes. */
export async function getNewEpisodes(limit = 12): Promise<NewEpisodesItem[]> {
  const snapshot = (await settingsRepository.getSetting<Snapshot>(SETTING_KEY).catch(() => undefined)) ?? {};
  const now = Date.now();
  const candidates = Object.entries(snapshot)
    .map(([seriesId, s]) => ({ seriesId, fresh: s.fresh.filter((f) => now - f.at < NEW_FOR_MS) }))
    .filter((c) => c.fresh.length > 0)
    .sort((a, b) => Math.max(...b.fresh.map((f) => f.at)) - Math.max(...a.fresh.map((f) => f.at)));
  if (candidates.length === 0) return [];
  const seriesRows = await catalogRepository.getSeriesByIds(candidates.map((c) => c.seriesId));
  const byId = new Map(seriesRows.map((s) => [s.id, s] as const));
  const out: NewEpisodesItem[] = [];
  for (const c of candidates) {
    const series = byId.get(c.seriesId);
    const details = series !== undefined ? await catalogRepository.getSeriesDetails(c.seriesId) : undefined;
    if (series === undefined || details === undefined) continue;
    const progress = await playbackRepository.getSeriesEpisodeProgress(c.seriesId);
    const freshIds = new Set(c.fresh.map((f) => f.id));
    // Deja regarde (meme commence) : n'est plus « nouveau ».
    const episodes = details.episodes.filter((e) => freshIds.has(e.id) && !progress.has(e.id));
    if (episodes.length > 0) out.push({ series, episodes });
    if (out.length >= limit) break;
  }
  return out;
}
