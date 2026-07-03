import type { ChannelQuality } from '@/types/liveGrouping';
import { stripDecorative } from '@/utils/displayTitle';
import { normalizeText } from '@/utils/text';

/**
 * Normalisation de nom de chaine Live pour le groupement des doublons.
 * Robuste aux tags qualite (plain ET decorations unicode), aux prefixes
 * pays/categorie et aux variantes d'orthographe des chaines FR connues.
 */

// Tags qualite — plain + variantes decoratives frequentes du catalogue.
const QUALITY_PATTERNS: { quality: ChannelQuality; label: string; re: RegExp }[] = [
  { quality: 'UHD', label: '4K', re: /\b(4k|uhd|2160p?|3840p?)\b|⁴ᴷ|ᵁᴴᴰ|³⁸⁴⁰ᴾ/i },
  { quality: 'FHD', label: 'FHD', re: /\b(fhd|1080p?)\b/i },
  { quality: 'HD', label: 'HD', re: /\bhd\b|ᴴᴰ|\b720p?\b/i },
  { quality: 'HEVC', label: 'HEVC', re: /\b(hevc|h\.?265|x265)\b|ʰᵉᵛᶜ/i },
  { quality: 'RAW', label: 'RAW', re: /\braw\b|ᴿᴬᵂ|⁶⁰ᶠᵖˢ/i },
  { quality: 'VIP', label: 'VIP', re: /\bvip\b|ⱽᴵᴾ/i },
  { quality: 'BACKUP', label: 'Backup', re: /\b(backup|bk)\b|⁽ᴮᴷ⁾/i },
  { quality: 'SD', label: 'SD', re: /\bsd\b/i },
];

// Score de version : FHD/Standard/HD d'abord (compat maximale), 4K & bruts
// disponibles au choix. On ne peut pas detecter le support 4K -> defaut sur.
const QUALITY_SCORE: Record<ChannelQuality, number> = {
  FHD: 100,
  STANDARD: 92,
  HD: 88,
  UHD: 80,
  HEVC: 62,
  RAW: 58,
  SD: 55,
  VIP: 50,
  BACKUP: 10,
};

export interface DetectedQuality {
  quality: ChannelQuality;
  label: string;
  score: number;
}

/** Detecte la meilleure qualite lisible dans un nom de chaine. */
export function detectQuality(rawName: string): DetectedQuality {
  for (const { quality, label, re } of QUALITY_PATTERNS) {
    if (re.test(rawName)) return { quality, label, score: QUALITY_SCORE[quality] };
  }
  return { quality: 'STANDARD', label: 'Standard', score: QUALITY_SCORE.STANDARD };
}

// Tags a retirer du nom d'affichage (whole-word, insensible casse).
const STRIP_WORDS =
  /\b(4k|uhd|fhd|hd|sd|hevc|h\.?265|h\.?264|x265|x264|raw|vip|backup|bk|1080p?|720p?|2160p?|3840p?|60fps|multi|dolby|audio)\b/gi;

// Prefixe pays/categorie : "FR| ", "FR - ", "FHD| ", "4K| ", "US:" ...
const PREFIX = /^\s*[A-Za-z0-9]{2,5}\s*[|:\-–]\s*/;

/** Nom d'affichage propre d'une chaine (garde la casse, retire tags/prefixe). */
export function cleanChannelDisplay(rawName: string): string {
  let work = stripDecorative(rawName);
  work = work.replace(/\[[^\]]*\]/g, ' ').replace(/\([^)]*\)/g, ' ');
  work = work.replace(PREFIX, '');
  work = work.replace(STRIP_WORDS, ' ');
  work = work.replace(/[|]+/g, ' ').replace(/\s{2,}/g, ' ').replace(/\s*[-–]\s*$/, '').trim();
  return work !== '' ? work : stripDecorative(rawName).trim() || rawName.trim();
}

// Harmonisation des chaines FR connues (sur la cle normalisee).
function harmonize(key: string): string {
  let k = key.replace(/\+/g, ' plus ').replace(/\s{2,}/g, ' ').trim();
  k = k
    .replace(/\bbfm\s*tv\b/g, 'bfmtv')
    .replace(/\bfrance\s*info\b/g, 'franceinfo')
    .replace(/\bbein\s*spr?ts?\b/g, 'bein sports')
    .replace(/\beuro\s*sport\b/g, 'eurosport')
    .replace(/\bc\s*news\b/g, 'cnews')
    .replace(/\bcanal\s*plus\b/g, 'canal plus')
    .replace(/\bsport\s*360\b/g, 'sport 360')
    .replace(/\bnrj\s*12\b/g, 'nrj12')
    .replace(/\brmc\s*(?=story|decouverte|sport)/g, 'rmc ')
    .replace(/\bnational\s*geo(?:graphic)?\b/g, 'national geographic')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return k;
}

// Separateurs de menu ("##### FRANCE #####") et chaines evenementielles/PPV
// ("BE/FR: DAZN LIVE EVENT 3") — a exclure du bouquet principal (gardes en "Tous").
const SEPARATOR = /#{2,}|={3,}|\*{3,}|_{4,}|\.{4,}|—{2,}/;
const EVENT = /\b(no event|event stream|live event|ppv event|ppv|no match|coming soon|no stream|no streaming)\b/;

/** Vrai si l'entree est un separateur decoratif ou un flux evenementiel/PPV. */
export function isSeparatorOrEvent(name: string): boolean {
  const raw = name.trim();
  if (raw === '') return true;
  if (SEPARATOR.test(raw)) return true;
  if (/^[\s#=*_.\-–—]{4,}$/.test(raw)) return true;
  return EVENT.test(normalizeText(raw));
}

/** Cle canonique stable pour regrouper les doublons (TF1 HD / TF1 4K -> "tf1"). */
export function canonicalChannelKey(rawName: string): string {
  return harmonize(normalizeText(cleanChannelDisplay(rawName)));
}
