import { CACHE_TTL } from '@/config/constants';
import * as tmdbRepository from '@/db/repositories/tmdbRepository';
import type { TmdbGenreEntry } from '@/types/models';
import { movieGenres, tvGenres } from './tmdbClient';

/**
 * Correspondance genre TMDB `id -> nom` (source de verite des libelles de
 * « pills »). Recuperee une fois via /genre/movie|tv/list, cachee dans Dexie
 * (table tmdb_genres) avec TTL long — les genres TMDB sont quasi immuables.
 * Ne jette jamais : renvoie la derniere version connue (ou une map vide) si le
 * proxy est indisponible. Refonte VOD, etape 1.
 *
 * NB : ce service n'est PAS encore branche sur l'UI (etape 5) — il fournit
 * seulement la brique de donnees. Le stockage des genre_ids sur les lignes
 * (backfill) n'en depend pas.
 */

type GenreType = 'movie' | 'tv';

const GENRE_TTL = CACHE_TTL.tmdb; // 30 j
const memo = new Map<GenreType, Map<number, string>>();

function toMap(entries: TmdbGenreEntry[]): Map<number, string> {
  return new Map(entries.map((e) => [e.id, e.name]));
}

function isFresh(entries: TmdbGenreEntry[]): boolean {
  if (entries.length === 0) return false;
  const newest = entries.reduce((max, e) => Math.max(max, e.fetchedAt), 0);
  return Date.now() - newest < GENRE_TTL;
}

async function fetchGenres(type: GenreType): Promise<TmdbGenreEntry[] | null> {
  try {
    const res = await (type === 'movie' ? movieGenres() : tvGenres());
    const raw = res?.genres ?? [];
    if (raw.length === 0) return null;
    const now = Date.now();
    return raw.map((g) => ({ type, id: g.id, name: g.name, fetchedAt: now }));
  } catch {
    return null;
  }
}

/**
 * Garantit la disponibilite de la map genres d'un type et la renvoie. Ordre :
 * memo -> Dexie (si frais) -> proxy TMDB (puis persistance). En dernier recours,
 * renvoie les entrees Dexie perimees plutot que rien.
 */
export async function ensureGenres(type: GenreType): Promise<Map<number, string>> {
  const cachedMemo = memo.get(type);
  if (cachedMemo !== undefined) return cachedMemo;

  const stored = await tmdbRepository.getGenreEntries(type);
  if (isFresh(stored)) {
    const map = toMap(stored);
    memo.set(type, map);
    return map;
  }

  const fetched = await fetchGenres(type);
  if (fetched !== null) {
    await tmdbRepository.replaceGenreEntries(type, fetched);
    const map = toMap(fetched);
    memo.set(type, map);
    return map;
  }

  // Proxy indisponible : on se rabat sur le cache perime (mieux que rien).
  const fallback = toMap(stored);
  if (fallback.size > 0) memo.set(type, fallback);
  return fallback;
}

/** Chauffe les deux maps (films + series) — utile au demarrage/synchro (etape 2). */
export async function ensureAllGenres(): Promise<void> {
  await Promise.all([ensureGenres('movie'), ensureGenres('tv')]);
}

/** Nom d'un genre TMDB, ou null si inconnu. */
export async function getGenreName(type: GenreType, id: number): Promise<string | null> {
  const map = await ensureGenres(type);
  return map.get(id) ?? null;
}

/** Vide le memo (tests / apres purge). */
export function resetGenreMemo(): void {
  memo.clear();
}

/** Libelles de repli (TMDB fr-FR) si la table des genres n'est pas encore chargee. */
export const FALLBACK_GENRE_NAMES: Record<'movie' | 'tv', Record<number, string>> = {
  movie: {
    28: 'Action', 12: 'Aventure', 16: 'Animation', 35: 'Comédie', 80: 'Crime', 99: 'Documentaire',
    18: 'Drame', 10751: 'Familial', 14: 'Fantastique', 27: 'Horreur', 10749: 'Romance',
    878: 'Science-Fiction', 53: 'Thriller', 10752: 'Guerre', 37: 'Western', 9648: 'Mystère',
  },
  tv: {
    10759: 'Action & Aventure', 16: 'Animation', 35: 'Comédie', 80: 'Crime', 99: 'Documentaire',
    18: 'Drame', 10751: 'Familial', 10762: 'Kids', 9648: 'Mystère', 10765: 'Science-Fiction & Fantastique',
  },
};

/**
 * Noms de genres TMDB (cache Dexie / proxy) COMPLETES par les libelles de
 * repli : jamais vide, meme hors ligne ou TMDB non configure.
 */
export async function genreNames(type: GenreType): Promise<Map<number, string>> {
  const loaded = await ensureGenres(type).catch(() => new Map<number, string>());
  const merged = new Map<number, string>(Object.entries(FALLBACK_GENRE_NAMES[type]).map(([id, name]) => [Number(id), name]));
  for (const [id, name] of loaded) merged.set(id, name);
  return merged;
}
