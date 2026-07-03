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
import { buildSearchTokens, normalizeText } from '@/utils/text';
import { cleanTitle } from '@/utils/titleCleaner';

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
  return rating !== null ? Math.min(Math.max(rating, 0), 10) : null;
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

export function normalizeMovie(raw: XtreamVodStream, categoryIsFrench: boolean): Movie {
  const name = strOrNull(raw.name) ?? `Film ${String(raw.stream_id)}`;
  const rawYear = toNum(raw.year);
  const year =
    rawYear !== null && rawYear >= 1900 && rawYear <= 2100 ? Math.trunc(rawYear) : cleanTitle(name).year;
  return {
    id: String(raw.stream_id),
    categoryId: normalizeCategoryId(raw.category_id),
    name,
    normalizedName: normalizeText(name),
    searchTokens: buildSearchTokens(name),
    posterUrl: strOrNull(raw.stream_icon),
    containerExtension: strOrNull(raw.container_extension),
    rating: rating10(raw.rating, raw.rating_5based),
    year,
    addedAt: epochToMs(raw.added),
    isFrench: categoryIsFrench || isFrenchLabel(name) ? 1 : 0,
    country: detectCountry(name),
    language: detectLanguage(name),
  };
}

export function normalizeSeries(raw: XtreamSeries, categoryIsFrench: boolean): Series {
  const name = strOrNull(raw.name) ?? `Serie ${String(raw.series_id)}`;
  const backdrop = Array.isArray(raw.backdrop_path)
    ? (raw.backdrop_path[0] ?? null)
    : (raw.backdrop_path ?? null);
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
    releaseDate: strOrNull(raw.releaseDate ?? raw.release_date),
    rating: rating10(raw.rating, raw.rating_5based),
    lastModifiedAt: epochToMs(raw.last_modified),
    isFrench: categoryIsFrench || isFrenchLabel(name) ? 1 : 0,
    country: detectCountry(name),
    language: detectLanguage(name),
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
