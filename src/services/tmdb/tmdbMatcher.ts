import type { TmdbMetadata } from '@/types/models';
import { normalizeText } from '@/utils/text';
import { cleanTitle } from '@/utils/titleCleaner';
import {
  movieDetail,
  searchMovie,
  searchTv,
  tvDetail,
  type TmdbDetailRaw,
  type TmdbSearchItem,
} from './tmdbClient';

/** Matching IPTV -> TMDB : nettoyage du titre, recherche, choix du meilleur candidat. */

const CAST_LIMIT = 8;

/** Cle de cache stable derivee du titre nettoye (+ annee) et du type. */
export function tmdbCacheKey(type: 'movie' | 'tv', rawName: string): string {
  const { title, year } = cleanTitle(rawName);
  return `${type}|${normalizeText(title)}|${year ?? ''}`;
}

function itemTitle(item: TmdbSearchItem): string {
  return item.title ?? item.name ?? '';
}

function itemYear(item: TmdbSearchItem): number | null {
  const date = item.release_date ?? item.first_air_date ?? '';
  const y = Number.parseInt(date.slice(0, 4), 10);
  return Number.isFinite(y) ? y : null;
}

/** Score un candidat : egalite de titre normalise + proximite d'annee. */
function scoreCandidate(candidate: TmdbSearchItem, wantedTitle: string, wantedYear: number | null): number {
  const nt = normalizeText(itemTitle(candidate));
  let score = 0;
  if (nt === wantedTitle) score += 100;
  else if (nt.startsWith(wantedTitle) || wantedTitle.startsWith(nt)) score += 60;
  else if (nt.includes(wantedTitle) || wantedTitle.includes(nt)) score += 30;

  if (wantedYear !== null) {
    const cy = itemYear(candidate);
    if (cy === wantedYear) score += 25;
    else if (cy !== null && Math.abs(cy - wantedYear) <= 1) score += 12;
  }
  return score;
}

function pickBest(
  results: TmdbSearchItem[] | undefined,
  wantedTitle: string,
  wantedYear: number | null,
): TmdbSearchItem | null {
  if (results === undefined || results.length === 0) return null;
  let best: TmdbSearchItem | null = null;
  let bestScore = -1;
  for (const r of results.slice(0, 8)) {
    const s = scoreCandidate(r, wantedTitle, wantedYear);
    if (s > bestScore) {
      bestScore = s;
      best = r;
    }
  }
  // Sous le seuil de confiance : AUCUN candidat credible -> null (etat degrade
  // propre cote UI). Renvoyer results[0] affichait une affiche/synopsis sans
  // rapport pour les titres de niche absents de TMDB.
  return bestScore >= 30 ? best : null;
}

function mapDetail(raw: TmdbDetailRaw): TmdbMetadata {
  const runtime = raw.runtime ?? (raw.episode_run_time?.[0] ?? null);
  return {
    tmdbId: raw.id,
    title: raw.title ?? raw.name ?? '',
    overview: raw.overview ?? null,
    posterPath: raw.poster_path ?? null,
    backdropPath: raw.backdrop_path ?? null,
    releaseDate: raw.release_date ?? raw.first_air_date ?? null,
    voteAverage: raw.vote_average ?? null,
    genres: (raw.genres ?? []).map((g) => g.name),
    runtimeMinutes: runtime !== null && runtime > 0 ? runtime : null,
    cast: (raw.credits?.cast ?? [])
      .slice(0, CAST_LIMIT)
      .map((c) => ({ name: c.name ?? '', character: c.character ?? null }))
      .filter((c) => c.name !== ''),
  };
}

async function enrich(
  type: 'movie' | 'tv',
  rawName: string,
  fallbackYear: number | null,
): Promise<TmdbMetadata | null> {
  const { title, year } = cleanTitle(rawName);
  const wantedTitle = normalizeText(title);
  const wantedYear = year ?? fallbackYear;
  if (wantedTitle === '') return null;

  const search = type === 'movie' ? searchMovie(title, wantedYear ?? undefined) : searchTv(title, wantedYear ?? undefined);
  let response = await search;
  // Retry sans annee si aucun resultat (annee IPTV parfois fausse).
  if ((response?.results?.length ?? 0) === 0 && wantedYear !== null) {
    response = await (type === 'movie' ? searchMovie(title) : searchTv(title));
  }
  const best = pickBest(response?.results, wantedTitle, wantedYear);
  if (best === null) return null;

  const detail = await (type === 'movie' ? movieDetail(best.id) : tvDetail(best.id));
  if (detail === null) {
    // Detail indisponible : on retombe sur les champs de recherche.
    return {
      tmdbId: best.id,
      title: itemTitle(best),
      overview: best.overview ?? null,
      posterPath: best.poster_path ?? null,
      backdropPath: best.backdrop_path ?? null,
      releaseDate: best.release_date ?? best.first_air_date ?? null,
      voteAverage: best.vote_average ?? null,
      genres: [],
      runtimeMinutes: null,
      cast: [],
    };
  }
  return mapDetail(detail);
}

export function enrichMovie(rawName: string, year: number | null): Promise<TmdbMetadata | null> {
  return enrich('movie', rawName, year);
}

export function enrichSeries(rawName: string, year: number | null): Promise<TmdbMetadata | null> {
  return enrich('tv', rawName, year);
}
