/**
 * Diagnostic PISTES & QUALITE — sonde REELLE du flux (ffprobe via passerelle).
 *
 * Xtream ne revele au mieux qu'UNE piste video + UNE audio (get_vod_info). La
 * seule source de verite sur le multi-audio / sous-titres / 10-bit est un
 * ffprobe du flux reel (endpoint passerelle /_probe). Ces types decrivent
 * (a) la reponse brute sanitizee de la passerelle, (b) le rapport AGREGE et
 * ANONYMISE (aucune URL/identifiant — invariant #4) affiche et exportable.
 */

/** Piste renvoyee par /_probe (deja sanitizee cote passerelle : pas de filename). */
export interface ProbeStreamInfo {
  index: number;
  type: 'video' | 'audio' | 'subtitle' | string | null;
  codec: string | null;
  profile: string | null;
  width: number | null;
  height: number | null;
  pix_fmt: string | null;
  level: number | null;
  color_transfer: string | null;
  color_primaries: string | null;
  field_order: string | null;
  channels: number | null;
  channel_layout: string | null;
  sample_rate: string | null;
  bit_rate: string | null;
  language: string | null;
  title: string | null;
  default: number;
  forced: number;
}

export interface ProbeFormatInfo {
  format_name: string | null;
  duration: string | null;
  bit_rate: string | null;
  size: string | null;
}

/** Reponse du endpoint passerelle /_probe. */
export interface ProbeResponse {
  ok: boolean;
  error?: string;
  format?: ProbeFormatInfo;
  streams?: ProbeStreamInfo[];
}

/** Ligne d'histogramme "libelle -> compte" (triee desc a la construction). */
export interface CountRow {
  label: string;
  count: number;
}

/** Statistiques agregees d'une section (films OU episodes de series). */
export interface TrackSectionStats {
  section: 'vod' | 'series';
  sampled: number; // items tentes
  probed: number; // sondes avec succes
  failed: number; // sondes en echec (flux mort/timeout/hors passerelle)
  containers: CountRow[]; // depuis le catalogue (mkv/mp4...), pas l'URL
  videoCodecs: CountRow[];
  resolutions: CountRow[];
  tenBit: number; // pistes video 10-bit (HEVC 10-bit typiquement)
  hdr: number; // HDR/HLG (color_transfer)
  audioTrackCounts: CountRow[]; // "1 piste", "2 pistes", "3+ pistes"
  multiAudio: number; // items avec >= 2 pistes audio
  audioLanguages: CountRow[];
  audioCodecs: CountRow[];
  withSubs: number; // items avec >= 1 sous-titre integre
  subtitleLanguages: CountRow[];
  subtitleCodecs: CountRow[];
  examples: string[]; // layouts anonymises ("H264 1080p · 2 audio (FR, EN) · 1 st (FR)")
}

/** Rapport global anonymise du diagnostic pistes. */
export interface TrackDiagnostic {
  generatedAtLabel: string; // "2026-07" — jamais un timestamp precis
  anonymized: true;
  gateway: { configured: boolean; healthy: boolean };
  sampleSize: number;
  sections: TrackSectionStats[];
  findings: string[]; // conclusions lisibles (part multi-audio, sous-titres, 10-bit...)
  errors: string[];
}
