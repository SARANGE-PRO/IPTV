import { QUALITY_TAGS } from '@/config/constants';

/** Nettoyage des titres IPTV pour le matching TMDB. */

const TAG_SET = new Set(QUALITY_TAGS.map((t) => t.replace(/[^a-z0-9]/g, '')));

export interface CleanedTitle {
  title: string;
  year: number | null;
}

function normalizeToken(token: string): string {
  return token
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * "FR - Interstellar (2014) MULTI 4K x265" -> { title: "Interstellar", year: 2014 }.
 * Retire groupes [..], prefixe pays en capitales, tags qualite ; extrait l'annee.
 */
export function cleanTitle(raw: string): CleanedTitle {
  let work = raw.trim();
  let year: number | null = null;

  // Style release "Film.2023.FRENCH.1080p" : points = separateurs
  if (!/\s/.test(work) && (work.match(/\./g) ?? []).length >= 2) {
    work = work.replace(/\./g, ' ');
  }

  work = work.replace(/\[[^\]]*\]/g, ' '); // [FR], [MULTI]...
  work = work.replace(/^\s*\|?[A-Z]{2,3}\|?\s*[-|:]\s*/, ''); // "FR - ", "FR|", "USA:"

  const parenYear = work.match(/\(((?:19|20)\d{2})\)/);
  if (parenYear?.[1] !== undefined) {
    year = Number(parenYear[1]);
    work = work.replace(parenYear[0], ' ');
  }

  const kept: string[] = [];
  for (const token of work.split(/\s+/)) {
    const norm = normalizeToken(token);
    if (norm === '') continue;
    if (TAG_SET.has(norm)) continue;
    if (year === null && /^(?:19|20)\d{2}$/.test(norm)) {
      year = Number(norm);
      continue;
    }
    kept.push(token);
  }

  let title = kept
    .join(' ')
    .replace(/^\s*[-|:]+\s*/, '')
    .replace(/\s*[-|:]+\s*$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (title === '') title = raw.trim();
  return { title, year };
}
