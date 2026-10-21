import { isFrenchWatchable, laneOf } from '@/types/mediaLanguage';
import type { Category, Episode, LiveChannel, Movie, Season, Section, Series, SeriesDetails } from '@/types/models';
import type {
  NumLike,
  XtreamCategory,
  XtreamEpisode,
  XtreamLiveStream,
  XtreamSeries,
  XtreamSeriesInfo,
  XtreamVodStream,
} from '@/types/xtream';
import { detectChannelTheme, detectUhd } from '@/utils/channelTheme';
import { detectCountry, detectLanguage } from '@/utils/countryDetection';
import { isFrenchLabel } from '@/utils/frenchDetection';
import { mediaGroupKey, parseMediaTitle, titleGroupKey } from '@/utils/mediaTitle';
import { buildSearchTokens, normalizeText } from '@/utils/text';

/** Infos de la categorie parente, transmises a la normalisation des items. */
export interface CategoryContext {
  isFrench: boolean;
  name: string;
}

/** Conversion types bruts Xtream -> modeles internes (coercition NumLike incluse). */

function toNum(value: NumLike | null | undefined): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const n = Number.parseFloat(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Epoch (secondes ou deja millisecondes selon panel) -> millisecondes. */
function epochToMs(value: NumLike | null | undefined): number | null {
  const n = toNum(value);
  if (n === null || n <= 0) return null;
  return n > 1e12 ? n : n * 1000;
}

function strOrNull(value: string | null | undefined): string | null {
  const v = (value ?? '').trim();
  return v === '' ? null : v;
}

/** category_id null/vide -> '0' (jamais null, sinon hors index Dexie). */
export function normalizeCategoryId(value: NumLike | null | undefined): string {
  return value === null || value === undefined || value === '' ? '0' : String(value);
}

function rating10(raw10: NumLike | null | undefined, raw5: NumLike | null | undefined): number | null {
  const r10 = toNum(raw10);
  const r5 = toNum(raw5);
  const rating = r10 ?? (r5 !== null ? r5 * 2 : null);
  if (rating === null) return null;
  const clamped = Math.min(Math.max(rating, 0), 10);
  // 0 = « pas de note » chez la plupart des panels : on ne le fait pas passer
  // pour une vraie note (sinon il polluerait les tris « mieux notes »).
  return clamped > 0 ? clamped : null;
}

/** id TMDB fourni par le panel (`tmdb`) -> entier positif, sinon null. */
function toTmdbId(value: NumLike | null | undefined): number | null {
  const n = toNum(value);
  return n !== null && n > 0 ? Math.trunc(n) : null;
}

function validYear(value: number | null): number | null {
  return value !== null && value >= 1900 && value <= 2100 ? Math.trunc(value) : null;
}

function yearOfDate(value: string | null): number | null {
  if (value === null || value.length < 4) return null;
  return validYear(Number.parseInt(value.slice(0, 4), 10) || null);
}

export function normalizeCategory(section: Section, raw: XtreamCategory): Category {
  const name = strOrNull(raw.category_name) ?? 'Sans nom';
  return {
    id: String(raw.category_id),
    section,
    name,
    normalizedName: normalizeText(name),
    isFrench: isFrenchLabel(name) ? 1 : 0,
    country: detectCountry(name),
    language: detectLanguage(name),
  };
}

export function normalizeLiveChannel(raw: XtreamLiveStream, category?: CategoryContext): LiveChannel {
  const name = strOrNull(raw.name) ?? `Chaine ${String(raw.stream_id)}`;
  const categoryName = category?.name ?? '';
  return {
    id: String(raw.stream_id),
    categoryId: normalizeCategoryId(raw.category_id),
    name,
    normalizedName: normalizeText(name),
    searchTokens: buildSearchTokens(name),
    logoUrl: strOrNull(raw.stream_icon),
    epgChannelId: strOrNull(raw.epg_channel_id),
    sortOrder: toNum(raw.num) ?? 0,
    isFrench: (category?.isFrench ?? false) || isFrenchLabel(name) ? 1 : 0,
    theme: detectChannelTheme(name, categoryName),
    isUhd: detectUhd(name, categoryName) ? 1 : 0,
    country: detectCountry(name) ?? detectCountry(categoryName),
    language: detectLanguage(name) ?? detectLanguage(categoryName),
  };
}

/**
 * Film : titre/annee/variante/qualite issus du PARSEUR UNIQUE (utils/mediaTitle),
 * la categorie servant de repli pour la langue. `groupRank`/`laneRank` partent
 * a 0 (tout visible) : le service de regroupement les recalcule apres la sync.
 */
export function normalizeMovie(raw: XtreamVodStream, category?: CategoryContext): Movie {
  const name = strOrNull(raw.name) ?? `Film ${String(raw.stream_id)}`;
  const parsed = parseMediaTitle(name, category?.name ?? null);
  const year = validYear(toNum(raw.year)) ?? parsed.year;
  const rating = rating10(raw.rating, raw.rating_5based);
  const tmdbId = toTmdbId(raw.tmdb);
  // Cle titre : annee du TITRE d'abord (identique entre versions soeurs), le
  // champ `year` du panel pouvant manquer sur l'une d'elles.
  const titleKey = titleGroupKey(parsed.title, parsed.year ?? year);
  return {
    id: String(raw.stream_id),
    categoryId: normalizeCategoryId(raw.category_id),
    name,
    normalizedName: normalizeText(name),
    searchTokens: buildSearchTokens(name),
    posterUrl: strOrNull(raw.stream_icon),
    containerExtension: strOrNull(raw.container_extension),
    rating,
    year,
    addedAt: epochToMs(raw.added),
    isFrench: isFrenchWatchable(parsed.variant) ? 1 : 0,
    country: detectCountry(name),
    language: detectLanguage(name),
    tmdbId,
    tmdbGenreIds: [],
    tmdbYear: null,
    tmdbRating: null,
    tmdbState: 0,
    variant: parsed.variant,
    variantSource: parsed.variantSource,
    lane: laneOf(parsed.variant),
    qualityScore: parsed.qualityScore,
    titleKey,
    groupKey: mediaGroupKey(tmdbId, titleKey),
    groupRank: 0,
    laneRank: 0,
    ratingSort: rating ?? 0,
    yearSort: year ?? 0,
  };
}

export function normalizeSeries(raw: XtreamSeries, category?: CategoryContext): Series {
  const name = strOrNull(raw.name) ?? `Serie ${String(raw.series_id)}`;
  const parsed = parseMediaTitle(name, category?.name ?? null);
  const backdrop = Array.isArray(raw.backdrop_path)
    ? (raw.backdrop_path[0] ?? null)
    : (raw.backdrop_path ?? null);
  const releaseDate = strOrNull(raw.releaseDate ?? raw.release_date);
  const year = parsed.year ?? yearOfDate(releaseDate);
  const rating = rating10(raw.rating, raw.rating_5based);
  const tmdbId = toTmdbId(raw.tmdb);
  // Series : l'annee ne figure presque jamais dans le nom et `releaseDate`
  // varie d'une version a l'autre -> cle sur le titre (+ annee du titre seule).
  const titleKey = titleGroupKey(parsed.title, parsed.year);
  return {
    id: String(raw.series_id),
    categoryId: normalizeCategoryId(raw.category_id),
    name,
    normalizedName: normalizeText(name),
    searchTokens: buildSearchTokens(name),
    posterUrl: strOrNull(raw.cover),
    backdropUrl: strOrNull(backdrop),
    plot: strOrNull(raw.plot),
    genre: strOrNull(raw.genre),
    releaseDate,
    rating,
    lastModifiedAt: epochToMs(raw.last_modified),
    isFrench: isFrenchWatchable(parsed.variant) ? 1 : 0,
    country: detectCountry(name),
    language: detectLanguage(name),
    tmdbId,
    tmdbGenreIds: [],
    tmdbYear: null,
    tmdbRating: null,
    tmdbState: 0,
    year,
    variant: parsed.variant,
    variantSource: parsed.variantSource,
    lane: laneOf(parsed.variant),
    qualityScore: parsed.qualityScore,
    titleKey,
    groupKey: mediaGroupKey(tmdbId, titleKey),
    groupRank: 0,
    laneRank: 0,
    ratingSort: rating ?? 0,
    yearSort: year ?? 0,
  };
}

/** Detail serie : gere `episodes` en objet par saison OU tableau de tableaux. */
export function normalizeSeriesDetails(seriesId: string, raw: XtreamSeriesInfo): SeriesDetails {
  const episodesRaw = raw.episodes;
  let flat: XtreamEpisode[] = [];
  if (Array.isArray(episodesRaw)) flat = episodesRaw.flat();
  else if (episodesRaw !== undefined) flat = Object.values(episodesRaw).flat();

  const episodes: Episode[] = flat.map((e) => ({
    id: String(e.id),
    seasonNumber: toNum(e.season ?? e.info?.season) ?? 1,
    episodeNumber: toNum(e.episode_num) ?? 0,
    title: strOrNull(e.title) ?? `Episode ${String(e.episode_num)}`,
    containerExtension: strOrNull(e.container_extension),
    durationSecs: toNum(e.info?.duration_secs),
    plot: strOrNull(e.info?.plot),
    imageUrl: strOrNull(e.info?.movie_image),
  }));
  episodes.sort((a, b) => a.seasonNumber - b.seasonNumber || a.episodeNumber - b.episodeNumber);

  let seasons: Season[] = (raw.seasons ?? []).map((s) => ({
    seasonNumber: toNum(s.season_number) ?? 0,
    name: strOrNull(s.name) ?? `Saison ${String(s.season_number)}`,
    episodeCount: toNum(s.episode_count) ?? 0,
    coverUrl: strOrNull(s.cover_big) ?? strOrNull(s.cover),
    airDate: strOrNull(s.air_date),
  }));
  // Certains panels omettent `seasons` : on les derive des episodes.
  if (seasons.length === 0 && episodes.length > 0) {
    const numbers = [...new Set(episodes.map((e) => e.seasonNumber))].sort((a, b) => a - b);
    seasons = numbers.map((n) => ({
      seasonNumber: n,
      name: `Saison ${n}`,
      episodeCount: episodes.filter((e) => e.seasonNumber === n).length,
      coverUrl: null,
      airDate: null,
    }));
  }
  seasons.sort((a, b) => a.seasonNumber - b.seasonNumber);

  return { seriesId, seasons, episodes, fetchedAt: Date.now() };
}
