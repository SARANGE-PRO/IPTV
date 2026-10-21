import type { MediaVariant, VariantSource } from '@/types/mediaLanguage';
import { detectLanguage as detectLabelLanguage } from '@/utils/countryDetection';
import { normalizeText, tokenizeLabel } from '@/utils/text';

/**
 * PARSEUR DE TITRE IPTV — source unique de verite pour :
 *  - le titre d'affichage (et le titre envoye a TMDB),
 *  - l'annee,
 *  - la VARIANTE de langue (VF / MULTI / VOSTFR / VO / OTHER),
 *  - la qualite (4K / FHD / HD / SD),
 *  - la cle de regroupement des versions d'un meme film.
 *
 * Brique PURE (aucun acces reseau/Dexie), testable en Node.
 *
 * Principe : un nom Xtream = [prefixes] TITRE [frontiere] TAGS. La frontiere
 * est le premier token « fort » (annee nue, qualite, codec, tag langue strict)
 * situe apres le premier mot. Avant la frontiere, seuls les tags STRICTS
 * (VF, VOSTFR, MULTI…) et, en fin de titre, les mots ambigus en MAJUSCULES
 * (FRENCH, FR, VO, EN) sont consideres comme des tags — « The French Dispatch »
 * reste un titre. Apres la frontiere, tout ce qui n'est pas reconnu (groupe de
 * release, bruit) est ignore.
 */

export interface ParsedMediaTitle {
  /** Titre propre (casse/accents d'origine), jamais vide. */
  title: string;
  year: number | null;
  variant: MediaVariant;
  variantSource: VariantSource;
  /** '4K' | 'FHD' | 'HD' | 'SD' | null. */
  qualityLabel: string | null;
  /** 0 (inconnu) .. 41 (4K HDR) — compare les versions d'un meme titre. */
  qualityScore: number;
}

type LangTag = 'vf' | 'multi' | 'vostfr' | 'vo' | 'other';

const CURRENT_YEAR = new Date().getFullYear();

// Superscripts/subscripts, petites capitales, formes geometriques, symboles
// divers (▶ ⱽᴵᴾ ᴿᴬᵂ ⁶⁰ᶠᵖˢ ⁴ᴷ ²³¹ …).
const DECORATIVE = /[²³¹ʰ-˿ᴀ-ᶿⱠ-Ɀ⁰-₟①-⓿■-◿☀-➿]/g;

/** Retire les decorations unicode (ᴿᴬᵂ ⁶⁰ᶠᵖˢ ᴴᴰ ⱽᴵᴾ ⁴ᴷ ▶…). */
export function stripDecorative(raw: string): string {
  return raw.replace(DECORATIVE, '').replace(/\s{2,}/g, ' ').trim();
}

/** Token compare : minuscules, sans accents, alphanumerique pur. */
function norm(token: string): string {
  return token
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

// --- Tables de tags ------------------------------------------------------------

/** Tags langue fiables, jamais des mots courants : comptent partout. */
const LANG_STRICT: Record<string, LangTag> = {
  vf: 'vf',
  vff: 'vf',
  vfq: 'vf',
  vfi: 'vf',
  vf2: 'vf',
  vfb: 'vf',
  truefrench: 'vf',
  vostfr: 'vostfr',
  vostf: 'vostfr',
  subfrench: 'vostfr',
  vost: 'vostfr',
  multi: 'multi',
};

/** Mots ambigus : tags seulement en position de tag (apres la frontiere, ou en
 *  fin de titre et en MAJUSCULES, ou entre crochets/prefixe). */
const LANG_CONTEXT: Record<string, LangTag> = {
  french: 'vf',
  fr: 'vf',
  fra: 'vf',
  vo: 'vo',
  en: 'vo',
  eng: 'vo',
  english: 'vo',
};

/** Codes pays/langue acceptes UNIQUEMENT en prefixe ("FR - ", "AR|") ou entre crochets. */
const CODE_LANG: Record<string, LangTag> = {
  fr: 'vf',
  fra: 'vf',
  fre: 'vf',
  be: 'vf',
  bel: 'vf',
  ch: 'vf',
  ca: 'vf',
  can: 'vf',
  qc: 'vf',
  lu: 'vf',
  vf: 'vf',
  vff: 'vf',
  vfq: 'vf',
  truefrench: 'vf',
  french: 'vf',
  france: 'vf',
  multi: 'multi',
  vostfr: 'vostfr',
  vost: 'vostfr',
  vo: 'vo',
  en: 'vo',
  eng: 'vo',
  us: 'vo',
  usa: 'vo',
  uk: 'vo',
  gb: 'vo',
  ar: 'other',
  ara: 'other',
  arab: 'other',
  arabic: 'other',
  tr: 'other',
  tur: 'other',
  turk: 'other',
  es: 'other',
  esp: 'other',
  spa: 'other',
  lat: 'other',
  latino: 'other',
  de: 'other',
  ger: 'other',
  deu: 'other',
  it: 'other',
  ita: 'other',
  pt: 'other',
  por: 'other',
  br: 'other',
  bra: 'other',
  nl: 'other',
  pl: 'other',
  pol: 'other',
  ru: 'other',
  rus: 'other',
  in: 'other',
  ind: 'other',
  hi: 'other',
  hin: 'other',
  pk: 'other',
  ma: 'other',
  dz: 'other',
  tn: 'other',
  eg: 'other',
  sa: 'other',
  qa: 'other',
  ae: 'other',
  ro: 'other',
  al: 'other',
  gr: 'other',
  bg: 'other',
  hu: 'other',
  cz: 'other',
  sk: 'other',
  hr: 'other',
  sr: 'other',
  se: 'other',
  dk: 'other',
  fi: 'other',
  ua: 'other',
  ir: 'other',
  fa: 'other',
  kr: 'other',
  jp: 'other',
  cn: 'other',
  zh: 'other',
  th: 'other',
  vn: 'other',
  id: 'other',
  af: 'other',
  afr: 'other',
};

/** Qualite video -> score de base (x10). */
const QUALITY: Record<string, { label: string; score: number }> = {
  '4k': { label: '4K', score: 4 },
  uhd: { label: '4K', score: 4 },
  '2160p': { label: '4K', score: 4 },
  fhd: { label: 'FHD', score: 3 },
  '1080p': { label: 'FHD', score: 3 },
  '1080i': { label: 'FHD', score: 3 },
  hd: { label: 'HD', score: 2 },
  '720p': { label: 'HD', score: 2 },
  hdlight: { label: 'HD', score: 2 },
  sd: { label: 'SD', score: 1 },
  '480p': { label: 'SD', score: 1 },
};

const HDR = new Set(['hdr', 'hdr10', 'dv', 'dovi', 'dolbyvision']);

const CODEC = new Set(['x264', 'x265', 'h264', 'h265', 'hevc', 'avc', 'av1', 'aac', 'ac3', 'eac3', 'dts', 'dtshd', 'truehd', '10bit', '8bit']);

/** Tags de source/bruit : consommes seulement APRES la frontiere. */
const SOURCE = new Set([
  'web', 'webrip', 'webdl', 'web-dl', 'bluray', 'blu', 'ray', 'brrip', 'bdrip', 'dvdrip', 'dvd', 'remux', 'hdtv', 'hdrip',
  'cam', 'hdcam', 'ts', 'tc', 'dolby', 'atmos', 'vision', 'hdr10plus', 'imax', 'extended', 'uncut', 'remastered',
  'proper', 'repack', 'internal', 'limited', 'complete', 'netflix', 'nf', 'amzn', 'dsnp', 'hmax', 'atvp', 'hulu',
]);

const SEPARATOR = /^[-|:–—•·,]+$/;

/** Prefixes pipe : n'importe quel mot court en MAJUSCULES/chiffres ("FR|", "NETFLIX |", "4K|"). */
const PIPE_PREFIX = /^\s*\|?\s*([A-Z0-9+]{2,10})\s*\|\s*/;
/** Prefixes tiret/deux-points : codes connus seulement ("FR - ", "VF: ", "MULTI -"). */
const DASH_PREFIX = /^\s*([A-Z]{2,3}|FRENCH|FRANCE|MULTI|VOSTFR|VOSTF|VOST|VF|VFF|VFQ|VO|4K|UHD|FHD|HD|SD)\s*[-:–]\s*/;

// --- Accumulateur --------------------------------------------------------------

interface Acc {
  lang: Set<LangTag>;
  year: number | null;
  quality: number;
  qualityLabel: string | null;
  hdr: boolean;
}

function isYear(n: string): boolean {
  if (!/^(?:19|20)\d{2}$/.test(n)) return false;
  const y = Number(n);
  return y >= 1900 && y <= CURRENT_YEAR + 1;
}

function applyQuality(acc: Acc, n: string): boolean {
  const q = QUALITY[n];
  if (q !== undefined) {
    if (q.score > acc.quality) {
      acc.quality = q.score;
      acc.qualityLabel = q.label;
    }
    return true;
  }
  if (HDR.has(n)) {
    acc.hdr = true;
    return true;
  }
  return false;
}

/** Tag « fort » : frontiere titre/tags (annee nue, qualite, codec, langue stricte). */
function applyStrong(acc: Acc, n: string, allowYear: boolean): boolean {
  const strict = LANG_STRICT[n];
  if (strict !== undefined) {
    acc.lang.add(strict);
    return true;
  }
  if (applyQuality(acc, n)) return true;
  if (CODEC.has(n)) return true;
  if (allowYear && acc.year === null && isYear(n)) {
    acc.year = Number(n);
    return true;
  }
  return false;
}

/** Apres la frontiere (ou entre crochets) : tout tag connu, y compris ambigus. */
function applyAny(acc: Acc, n: string, allowCodes: boolean): boolean {
  if (applyStrong(acc, n, true)) return true;
  const ctx = LANG_CONTEXT[n];
  if (ctx !== undefined) {
    acc.lang.add(ctx);
    return true;
  }
  if (allowCodes) {
    const code = CODE_LANG[n];
    if (code !== undefined) {
      acc.lang.add(code);
      return true;
    }
  }
  if (SOURCE.has(n)) return true;
  if (isYear(n)) {
    if (acc.year === null) acc.year = Number(n);
    return true;
  }
  return false;
}

function isUpper(token: string): boolean {
  return token === token.toUpperCase() && /[A-Z]/.test(token);
}

// --- Parseur ----------------------------------------------------------------------

function resolveVariant(lang: ReadonlySet<LangTag>): MediaVariant | null {
  if (lang.has('multi')) return 'MULTI';
  if (lang.has('vostfr')) return 'VOSTFR';
  if (lang.has('vf')) return 'VF';
  if (lang.has('vo')) return 'VO';
  if (lang.has('other')) return 'OTHER';
  return null;
}

/** Variante deduite d'un libelle de CATEGORIE fournisseur ("FR | FILMS 2024"…). */
export function categoryVariant(categoryName: string | null | undefined): MediaVariant | null {
  if (categoryName === null || categoryName === undefined || categoryName.trim() === '') return null;
  const tokens = tokenizeLabel(categoryName);
  const lang = new Set<LangTag>();
  for (const t of tokens) {
    const strict = LANG_STRICT[t];
    if (strict !== undefined) lang.add(strict);
    const ctx = LANG_CONTEXT[t];
    if (ctx !== undefined) lang.add(ctx);
  }
  if (categoryName.includes('\u{1F1EB}\u{1F1F7}')) lang.add('vf'); // drapeau 🇫🇷
  // Codes pays en position de prefixe/suffixe ("TR | DIZI", "SERIES | AR") —
  // jamais au milieu ("FILMS DE NOEL" : « de » n'est pas l'Allemagne).
  for (const t of [tokens[0], tokens[tokens.length - 1]]) {
    const code = t !== undefined ? CODE_LANG[t] : undefined;
    if (code !== undefined) lang.add(code);
  }
  const explicit = resolveVariant(lang);
  if (explicit !== null && explicit !== 'VO') return explicit;
  // Pays/langue par mots-cles (France, Quebec, Arabic, Turkish, Latino…).
  const code = detectLabelLanguage(categoryName);
  if (code === 'fr') return 'VF';
  if (code === 'en') return 'VO';
  if (code !== null) return 'OTHER';
  return explicit; // 'VO' explicite (EN/US/UK) ou null
}

/**
 * Analyse complete d'un nom Xtream. `categoryName` sert de repli pour la
 * variante quand le titre ne porte aucun tag de langue.
 */
export function parseMediaTitle(raw: string, categoryName?: string | null): ParsedMediaTitle {
  const acc: Acc = { lang: new Set(), year: null, quality: 0, qualityLabel: null, hdr: false };
  let work = stripDecorative(raw);

  // Style release "Film.2023.FRENCH.1080p" : points = separateurs.
  if (!/\s/.test(work) && (work.match(/\./g) ?? []).length >= 2) work = work.replace(/\./g, ' ');

  // Prefixes de categorie/langue, eventuellement enchaines ("FR| 4K| Titre").
  for (;;) {
    const pipe = PIPE_PREFIX.exec(work);
    if (pipe !== null && pipe[1] !== undefined) {
      applyAny(acc, norm(pipe[1]), true);
      work = work.slice(pipe[0].length);
      continue;
    }
    const dash = DASH_PREFIX.exec(work);
    if (dash !== null && dash[1] !== undefined) {
      applyAny(acc, norm(dash[1]), true);
      work = work.slice(dash[0].length);
      continue;
    }
    break;
  }

  // Groupes [..] : toujours des tags (contenu inconnu ignore).
  work = work.replace(/\[([^\]]*)\]/g, (_m, inner: string) => {
    for (const t of inner.split(/[\s,/|+\-]+/)) {
      const n = norm(t);
      if (n !== '') applyAny(acc, n, true);
    }
    return ' ';
  });

  // Groupes (..) : consommes seulement si ENTIEREMENT composes de tags/annee.
  work = work.replace(/\(([^)]*)\)/g, (match, inner: string) => {
    const parts = inner.split(/[\s,/|+\-]+/).map(norm).filter((n) => n !== '');
    if (parts.length === 0) return ' ';
    const probe: Acc = { lang: new Set(), year: null, quality: 0, qualityLabel: null, hdr: false };
    if (!parts.every((n) => applyAny(probe, n, false))) return match;
    for (const n of parts) applyAny(acc, n, false);
    return ' ';
  });

  const tokens = work.split(/\s+/).filter((t) => t !== '');

  // Tags en tete ("4K Titre", "VF Titre").
  let start = 0;
  while (start < tokens.length) {
    const n = norm(tokens[start] ?? '');
    if (n === '' || !applyStrong(acc, n, false)) break;
    start += 1;
  }

  // Frontiere : premier token fort apres le premier mot du titre.
  const hadParenYear = acc.year !== null;
  let boundary = tokens.length;
  for (let i = start + 1; i < tokens.length; i += 1) {
    const n = norm(tokens[i] ?? '');
    if (n === '') continue;
    if (applyStrong(acc, n, !hadParenYear)) {
      boundary = i;
      break;
    }
  }

  // Apres la frontiere : tags connus consommes, bruit ignore.
  for (let i = boundary + 1; i < tokens.length; i += 1) {
    const n = norm(tokens[i] ?? '');
    if (n !== '') applyAny(acc, n, false);
  }

  // Fin de titre : mots ambigus en MAJUSCULES (FRENCH, FR, VO, EN) + separateurs.
  let end = boundary;
  while (end > start + 1) {
    const tok = tokens[end - 1] ?? '';
    if (SEPARATOR.test(tok)) {
      end -= 1;
      continue;
    }
    const ctx = LANG_CONTEXT[norm(tok)];
    if (ctx !== undefined && isUpper(tok)) {
      acc.lang.add(ctx);
      end -= 1;
      continue;
    }
    break;
  }

  let title = tokens
    .slice(start, end)
    .join(' ')
    .replace(/^\s*[-|:–—]+\s*/, '')
    .replace(/\s*[-|:–—]+\s*$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (title === '') title = stripDecorative(raw) || raw.trim();

  const fromTitle = resolveVariant(acc.lang);
  let variant: MediaVariant;
  let variantSource: VariantSource;
  if (fromTitle !== null) {
    variant = fromTitle;
    variantSource = 2;
  } else {
    const fromCategory = categoryVariant(categoryName);
    if (fromCategory !== null) {
      variant = fromCategory;
      variantSource = 1;
    } else {
      variant = 'VO';
      variantSource = 0;
    }
  }

  return {
    title,
    year: acc.year,
    variant,
    variantSource,
    qualityLabel: acc.qualityLabel,
    qualityScore: acc.quality * 10 + (acc.hdr ? 1 : 0),
  };
}

/**
 * Cle de regroupement par TITRE (repli quand l'id TMDB est inconnu) :
 * alphanumerique normalise + annee si connue. Deux « Dune » d'annees
 * differentes (1984 / 2021) restent distincts. Sert aussi d'index de tri
 * alphabetique : le separateur « #» (0x23) se classe AVANT lettres et chiffres,
 * donc « Dune (1984) » precede « Dune 2 » et « Dune Deuxieme Partie ».
 */
export function titleGroupKey(title: string, year: number | null): string {
  const key = normalizeText(title).replace(/[^a-z0-9]+/g, ' ').trim();
  return year !== null ? `k:${key} #${year}` : `k:${key}`;
}

/** Cle de groupe par id TMDB (fiable, fusionne titres FR/EN d'un meme film). */
export function tmdbGroupKey(tmdbId: number): string {
  return `t:${tmdbId}`;
}

/** Cle de groupe finale : id TMDB en priorite, sinon la cle titre+annee. */
export function mediaGroupKey(tmdbId: number | null, titleKey: string): string {
  return tmdbId !== null ? tmdbGroupKey(tmdbId) : titleKey;
}
