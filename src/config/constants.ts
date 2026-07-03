/**
 * Constantes partagees : detection FR, nettoyage de titres, suggestions de
 * blacklist, durees de cache. Source unique de verite (aucune duplication
 * ailleurs dans le code).
 */

import type { Section } from '@/types/models';

/** Sections du catalogue, dans l'ordre de synchronisation. */
export const SECTIONS: readonly Section[] = ['live', 'vod', 'series'];

/** Pays / langue par defaut : la France est prioritaire. */
export const DEFAULT_COUNTRY = 'FR';
export const DEFAULT_LANGUAGE = 'fr';

/**
 * Mots-cles signalant un contenu ou une categorie francophone.
 * Comparaison insensible a la casse et aux accents (voir utils a venir).
 */
export const FRENCH_KEYWORDS = [
  'fr',
  'france',
  'francais',
  'french',
  'vf',
  'vff',
  'vfq',
  'vostfr',
  'truefrench',
  'francophone',
  'quebec',
  'belgique',
  'suisse',
] as const;

/**
 * Tags de qualite / encodage a retirer d'un titre IPTV avant matching TMDB.
 * Ex. "Interstellar 2014 MULTI 1080p x265" -> "Interstellar".
 */
export const QUALITY_TAGS = [
  'fhd',
  'uhd',
  'hd',
  'sd',
  '4k',
  '1080p',
  '720p',
  '480p',
  'vf',
  'vff',
  'vfq',
  'vo',
  'vost',
  'vostfr',
  'multi',
  'truefrench',
  'cam',
  'web-dl',
  'webdl',
  'webrip',
  'bluray',
  'brrip',
  'dvdrip',
  'x264',
  'x265',
  'h264',
  'h265',
  'hevc',
  'hdr',
  'dolby',
  'atmos',
] as const;

/**
 * Indices lexicaux pour proposer une blacklist initiale (mode diagnostic).
 * Ce ne sont que des SUGGESTIONS reactivables — rien n'est masque sans accord.
 */
export const DEFAULT_BLACKLIST_HINTS = [
  'adult',
  'xxx',
  'porn',
  '+18',
  '18+',
  'arabic',
  'turkish',
  'india',
  'pakistan',
  'espana',
  'espanol',
  'latino',
  'brasil',
  'portugal',
  'deutsch',
  'german',
  'italia',
  'polska',
  'russia',
] as const;

/**
 * Themes de chaines Live pour les filtres rapides. Detection par mots-cles sur
 * le nom de la chaine + le nom de sa categorie fournisseur. Ordre = priorite
 * de classification (premier theme qui matche l'emporte).
 */
export const CHANNEL_THEME_KEYWORDS: Record<string, readonly string[]> = {
  sport: ['sport', 'sports', 'foot', 'football', 'bein', 'rmc sport', 'canal sport', 'league', 'ligue', 'nba', 'ufc', 'f1', 'formula', 'tennis', 'rugby', 'golf', 'espn', 'eurosport', 'dazn', 'match'],
  news: ['news', 'info', 'infos', 'actu', 'bfm', 'cnews', 'lci', 'franceinfo', 'france info', 'i24', 'cnn', 'euronews', 'bbc news', 'al jazeera'],
  kids: ['kids', 'enfant', 'enfants', 'junior', 'cartoon', 'disney', 'nickelodeon', 'gulli', 'boomerang', 'baby', 'piwi', 'tiji', 'canal j', 'toon', 'jeunesse'],
  cinema: ['cinema', 'cine', 'film', 'films', 'movie', 'movies', 'canal+', 'canal plus', 'ocs', 'tcm', 'action', 'thriller', 'horror', 'horreur', 'comedie', 'paramount', 'warner'],
  music: ['music', 'musique', 'mtv', 'nrj', 'trace', 'clubbing', 'hits', 'radio', 'm6 music', 'melody', 'mcm'],
  doc: ['doc', 'docu', 'documentaire', 'discovery', 'national geographic', 'nat geo', 'histoire', 'science', 'planete', 'ushuaia', 'animaux', 'nature'],
  entertainment: ['divertissement', 'entertainment', 'serie', 'series', 'tv show', 'realite', 'tf1', 'm6', 'w9', 'tmc', 'nrj12', 'c8', 'tfx', 'general', 'generaliste'],
} as const;

/** Mots-cles marquant une chaine 4K / UHD / haute definition premium. */
export const UHD_KEYWORDS = ['4k', 'uhd', 'ultra hd', 'ultrahd', 'hevc', 'raw', 'hdr'] as const;

/** Durees de vie de cache par domaine (millisecondes). */
export const CACHE_TTL = {
  liveStreams: 1000 * 60 * 60 * 6, // 6 h
  vod: 1000 * 60 * 60 * 24, // 24 h
  series: 1000 * 60 * 60 * 24, // 24 h
  categories: 1000 * 60 * 60 * 24 * 7, // 7 j
  tmdb: 1000 * 60 * 60 * 24 * 30, // 30 j
} as const;
