import * as catalogRepository from '@/db/repositories/catalogRepository';
import * as settingsRepository from '@/db/repositories/settingsRepository';
import { personCredits, searchPerson as tmdbSearchPerson, type TmdbCreditRaw } from '@/services/tmdb/tmdbClient';
import { genreNames } from '@/services/tmdb/tmdbGenreService';
import { tmdbPoster } from '@/services/tmdb/tmdbImage';
import type { MediaVariant } from '@/types/mediaLanguage';
import type { LiveChannel, Movie, Series } from '@/types/models';
import { tmdbGroupKey } from '@/utils/mediaTitle';
import { normalizeText } from '@/utils/text';

/**
 * RECHERCHE facon Netflix (chantier P7) :
 *  - titres (films, series, chaines) via l'index local — une carte par titre,
 *    version preferee en tete (chantiers 1-2) ;
 *  - GENRE : « comedie », « horreur »… -> titres de ce genre (local) ;
 *  - PERSONNE : « dicaprio », « nolan » -> sa filmographie PRESENTE au
 *    catalogue (TMDB search/person + credits, rapproches par id TMDB) ;
 *  - recherches recentes (table settings, 10 max).
 */

export interface HiddenSets {
  live: ReadonlySet<string>;
  vod: ReadonlySet<string>;
  series: ReadonlySet<string>;
}

export interface TitleResults {
  movies: Movie[];
  series: Series[];
  live: LiveChannel[];
  /** Nombre total de chaines trouvees (l'apercu n'en montre que 24). */
  liveTotal: number;
}

const LIVE_PREVIEW = 24;

export async function searchTitles(
  query: string,
  order: readonly MediaVariant[],
  hidden: HiddenSets,
): Promise<TitleResults> {
  const [liveIds, movies, series] = await Promise.all([
    catalogRepository.findLiveChannelIds(query, hidden.live),
    catalogRepository.searchMovies(query, 30, hidden.vod, order),
    catalogRepository.searchSeries(query, 30, hidden.series, order),
  ]);
  // Apercu : 24 chaines (dans le meme ordre que la page Live), plus le total.
  const live = await catalogRepository.getLiveChannelsByIds(liveIds.ids.slice(0, LIVE_PREVIEW));
  return { movies, series, live, liveTotal: liveIds.ids.length };
}

// --- Genres ----------------------------------------------------------------------

export type GenreMatch =
  | { type: 'vod'; genreId: number; name: string; movies: Movie[] }
  | { type: 'series'; genreId: number; name: string; series: Series[] };

/** Genre dont le NOM commence par la requete (ou un de ses mots). 3 lettres minimum. */
function matchingGenres(query: string, names: Map<number, string>): { id: number; name: string }[] {
  const nq = normalizeText(query);
  if (nq.length < 3) return [];
  const out: { id: number; name: string }[] = [];
  for (const [id, name] of names) {
    const nn = normalizeText(name);
    if (nn.startsWith(nq) || nn.split(/[\s&-]+/).some((w) => w.length > 0 && w.startsWith(nq))) out.push({ id, name });
  }
  return out.slice(0, 2);
}

export async function searchGenres(
  query: string,
  order: readonly MediaVariant[],
  hidden: HiddenSets,
): Promise<GenreMatch[]> {
  const [movieNames, tvNames] = await Promise.all([genreNames('movie'), genreNames('tv')]);
  const out: GenreMatch[] = [];
  for (const g of matchingGenres(query, movieNames)) {
    const movies = await catalogRepository.findMovies(
      (m) => m.posterUrl !== null && !hidden.vod.has(m.categoryId) && m.tmdbGenreIds.includes(g.id),
      24,
      order,
      'rating',
    );
    if (movies.length > 0) out.push({ type: 'vod', genreId: g.id, name: g.name, movies });
  }
  for (const g of matchingGenres(query, tvNames)) {
    const series = await catalogRepository.findSeries(
      (s) => s.posterUrl !== null && !hidden.series.has(s.categoryId) && s.tmdbGenreIds.includes(g.id),
      24,
      order,
      'rating',
    );
    if (series.length > 0) out.push({ type: 'series', genreId: g.id, name: g.name, series });
  }
  return out;
}

// --- Personnes (acteurs, realisateurs) -------------------------------------------

export interface PersonMatch {
  id: number;
  name: string;
  /** « Acteur·rice », « Réalisation »… */
  role: string;
  photo: string | null;
  movies: Movie[];
  series: Series[];
}

const personMemo = new Map<string, PersonMatch | null>();

function roleLabel(department: string | undefined): string {
  if (department === 'Directing') return 'Réalisation';
  if (department === 'Writing') return 'Scénario';
  return 'Distribution';
}

/** Credits tries par popularite (realisation incluse), dedoublonnes par id. */
function rankedCredits(cast: TmdbCreditRaw[], crew: TmdbCreditRaw[]): TmdbCreditRaw[] {
  const all = [...cast, ...crew.filter((c) => c.job === 'Director' || c.job === 'Creator')];
  const seen = new Set<string>();
  return all
    .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
    .filter((c) => {
      const key = `${c.media_type ?? 'movie'}:${c.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

/**
 * Personne correspondant a la requete ET presente au catalogue (au moins un
 * titre enrichi par TMDB). Memo par requete pour la session. Ne jette jamais.
 */
export async function searchPerson(query: string, hidden: HiddenSets): Promise<PersonMatch | null> {
  const nq = normalizeText(query);
  if (nq.length < 3) return null;
  const memoKey = nq;
  if (personMemo.has(memoKey)) return personMemo.get(memoKey) ?? null;
  try {
    const people = ((await tmdbSearchPerson(query))?.results ?? [])
      .filter((p) => p.name !== undefined && p.name !== '')
      .slice(0, 2);
    for (const person of people) {
      const credits = await personCredits(person.id);
      if (credits === null) continue;
      const ranked = rankedCredits(credits.cast ?? [], credits.crew ?? []);
      const movieKeys = ranked.filter((c) => c.media_type !== 'tv').map((c) => tmdbGroupKey(c.id));
      const tvKeys = ranked.filter((c) => c.media_type === 'tv').map((c) => tmdbGroupKey(c.id));
      const [moviesRaw, seriesRaw] = await Promise.all([
        catalogRepository.getMoviesByGroupKeys(movieKeys.slice(0, 120), 80),
        catalogRepository.getSeriesByGroupKeys(tvKeys.slice(0, 80), 20),
      ]);
      // Ordre de popularite des credits (l'index renvoie l'ordre des cles).
      const rank = new Map([...movieKeys, ...tvKeys].map((k, i) => [k, i]));
      const byRank = <T extends { groupKey: string }>(a: T, b: T) => (rank.get(a.groupKey) ?? 0) - (rank.get(b.groupKey) ?? 0);
      const movies = moviesRaw.filter((m) => m.posterUrl !== null && !hidden.vod.has(m.categoryId)).sort(byRank);
      const series = seriesRaw.filter((s) => s.posterUrl !== null && !hidden.series.has(s.categoryId)).sort(byRank);
      if (movies.length + series.length === 0) continue;
      const match: PersonMatch = {
        id: person.id,
        name: person.name ?? query,
        role: roleLabel(person.known_for_department),
        photo: tmdbPoster(person.profile_path ?? null, 'w185'),
        movies,
        series,
      };
      personMemo.set(memoKey, match);
      return match;
    }
    personMemo.set(memoKey, null);
    return null;
  } catch {
    return null; // TMDB indisponible : la recherche par titre suffit
  }
}

// --- Recherches recentes -----------------------------------------------------------

const RECENT_KEY = 'recentSearches';
const RECENT_MAX = 10;

export async function getRecentSearches(): Promise<string[]> {
  return (await settingsRepository.getPersonalSetting<string[]>(RECENT_KEY)) ?? [];
}

/** Ajoute une recherche (en tete, sans doublon insensible a la casse/accents). */
export async function rememberSearch(query: string): Promise<string[]> {
  const q = query.trim();
  if (q.length < 2) return getRecentSearches();
  const nq = normalizeText(q);
  const next = [q, ...(await getRecentSearches()).filter((r) => normalizeText(r) !== nq)].slice(0, RECENT_MAX);
  await settingsRepository.setPersonalSetting(RECENT_KEY, next);
  return next;
}

export async function removeRecentSearch(query: string): Promise<string[]> {
  const next = (await getRecentSearches()).filter((r) => r !== query);
  await settingsRepository.setPersonalSetting(RECENT_KEY, next);
  return next;
}

export async function clearRecentSearches(): Promise<void> {
  await settingsRepository.setPersonalSetting(RECENT_KEY, []);
}
