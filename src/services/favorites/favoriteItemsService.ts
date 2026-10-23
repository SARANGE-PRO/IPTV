import * as catalogRepository from '@/db/repositories/catalogRepository';
import * as favoritesRepository from '@/db/repositories/favoritesRepository';
import { cleanChannelDisplay } from '@/services/live/channelNormalizer';
import { getLineupEntries, getLineupLogos } from '@/services/live/frenchLineupService';
import { compareFavoriteOrder } from '@/services/favorites/favoriteTabsService';
import type { MediaType, Movie, Series } from '@/types/models';

/**
 * Resolution des favoris (ids -> objets affichables) dans l'ordre demande.
 * Un id disparu du catalogue (apres une synchro) est compte, pas affiche.
 */

export interface FavoriteChannel {
  id: string;
  /** Nom de la grille FR si connu (« TF1 »), sinon nom fournisseur nettoye. */
  name: string;
  /** Meilleur logo de la chaine (toutes versions), sinon celui du flux. */
  logoUrl: string | null;
  /** Logos de repli (autres versions), essayes si `logoUrl` echoue. */
  logoAlternates: string[];
  isFrench: 0 | 1;
  categoryId: string;
  lcn: number | null;
  qualityLabel: string | null;
  groupKey: string | null;
}

export interface Resolved<T> {
  items: T[];
  missing: number;
}

function inOrder<T extends { id: string }>(ids: string[], rows: T[]): Resolved<T> {
  const byId = new Map(rows.map((r) => [r.id, r] as const));
  const items = ids.flatMap((id) => {
    const row = byId.get(id);
    return row !== undefined ? [row] : [];
  });
  return { items, missing: ids.length - items.length };
}

export async function resolveChannels(ids: string[]): Promise<Resolved<FavoriteChannel>> {
  if (ids.length === 0) return { items: [], missing: 0 };
  const [rows, entries, logos] = await Promise.all([
    catalogRepository.getLiveChannelsByIds(ids),
    getLineupEntries(ids).catch(() => ids.map(() => undefined)),
    getLineupLogos(ids).catch(() => new Map<string, string[]>()),
  ]);
  const entryById = new Map(entries.flatMap((e) => (e !== undefined ? [[e.id, e] as const] : [])));
  const channels: FavoriteChannel[] = rows.map((c) => {
    const entry = entryById.get(c.id);
    const [logoUrl = c.logoUrl, ...logoAlternates] = logos.get(c.id) ?? [];
    return {
      id: c.id,
      name: entry?.name ?? (cleanChannelDisplay(c.name) || c.name),
      logoUrl,
      logoAlternates,
      isFrench: c.isFrench,
      categoryId: c.categoryId,
      lcn: entry?.lcn ?? null,
      qualityLabel: entry !== undefined && entry.quality !== 'STANDARD' ? entry.qualityLabel : null,
      groupKey: entry?.groupKey ?? null,
    };
  });
  return inOrder(ids, channels);
}

export async function resolveMovies(ids: string[]): Promise<Resolved<Movie>> {
  return ids.length === 0 ? { items: [], missing: 0 } : inOrder(ids, await catalogRepository.getMoviesByIds(ids));
}

export async function resolveSeries(ids: string[]): Promise<Resolved<Series>> {
  return ids.length === 0 ? { items: [], missing: 0 } : inOrder(ids, await catalogRepository.getSeriesByIds(ids));
}

/** Ids favoris d'un type dans « Mon ordre » (manuel, sinon plus recents d'abord). */
export async function getOrderedFavoriteIds(type: MediaType): Promise<string[]> {
  const entries = await favoritesRepository.getFavoritesByType(type);
  return [...entries].sort(compareFavoriteOrder).map((e) => e.itemId);
}
