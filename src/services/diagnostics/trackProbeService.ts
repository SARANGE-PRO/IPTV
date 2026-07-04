import { MEDIA_GATEWAY_URL } from '@/services/player/mediaGatewayService';
import type { ProbeResponse, ProbeStreamInfo } from '@/types/trackDiagnostics';

/**
 * Sonde bas niveau : interroge l'endpoint passerelle /_probe (ffprobe du flux
 * amont reel) et classe les pistes. La passerelle a deja retire le `filename`
 * (URL + identifiants) ; on ne manipule ici que des metadonnees structurelles.
 */

const PROBE_TIMEOUT_MS = 22_000;

/** Sonde une URL de flux BRUTE (http Xtream). Renvoie ok:false sans jamais jeter. */
export async function probeStreamUrl(rawUrl: string): Promise<ProbeResponse> {
  if (MEDIA_GATEWAY_URL === '') return { ok: false, error: 'passerelle non configuree' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(`${MEDIA_GATEWAY_URL}/_probe?url=${encodeURIComponent(rawUrl)}`, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!res.ok) return { ok: false, error: `passerelle ${res.status}` };
    const data = (await res.json()) as ProbeResponse;
    return data.ok ? data : { ok: false, error: data.error ?? 'probe echoue' };
  } catch {
    return { ok: false, error: 'flux injoignable' };
  } finally {
    clearTimeout(timer);
  }
}

// --- Classificateurs (metadonnees ffprobe -> libelles lisibles) ---------------

export function resolutionBucket(height: number | null): string {
  if (height === null || height <= 0) return 'inconnue';
  if (height >= 2000) return '4K (2160p)';
  if (height >= 1400) return 'QHD (1440p)';
  if (height >= 1000) return 'Full HD (1080p)';
  if (height >= 700) return 'HD (720p)';
  if (height >= 500) return 'SD (576p)';
  return 'SD (≤480p)';
}

/** 10-bit (typiquement HEVC 10-bit) : Safari iOS refuse en <video> -> transcodage. */
export function isTenBit(pixFmt: string | null): boolean {
  return pixFmt !== null && /10le|10be|p010|yuv4[24]0p10/i.test(pixFmt);
}

/** HDR/HLG via la courbe de transfert (PQ = smpte2084, HLG = arib-std-b67). */
export function isHdr(colorTransfer: string | null): boolean {
  return colorTransfer !== null && /smpte2084|arib-std-b67|bt2020-10|bt2020-12/i.test(colorTransfer);
}

const LANG_LABELS: Record<string, string> = {
  fr: 'Français', fra: 'Français', fre: 'Français',
  en: 'Anglais', eng: 'Anglais',
  es: 'Espagnol', spa: 'Espagnol',
  de: 'Allemand', deu: 'Allemand', ger: 'Allemand',
  it: 'Italien', ita: 'Italien',
  pt: 'Portugais', por: 'Portugais',
  ar: 'Arabe', ara: 'Arabe',
  nl: 'Néerlandais', dut: 'Néerlandais', nld: 'Néerlandais',
  ja: 'Japonais', jpn: 'Japonais',
  ko: 'Coréen', kor: 'Coréen',
  zh: 'Chinois', chi: 'Chinois', zho: 'Chinois',
  ru: 'Russe', rus: 'Russe',
  tr: 'Turc', tur: 'Turc',
};

/** Langue lisible depuis un tag ffprobe (+ indice par le titre de piste : "VFF"). */
export function langLabel(stream: ProbeStreamInfo): string {
  const raw = (stream.language ?? '').trim().toLowerCase();
  if (raw !== '' && raw !== 'und' && raw !== 'unk') {
    return LANG_LABELS[raw] ?? raw.toUpperCase();
  }
  // Pas de tag langue : on tente le titre de piste ("VFF", "VO", "French"...).
  const title = (stream.title ?? '').toLowerCase();
  if (/\bvff?\b|\bvf\b|fran|\bfr\b/.test(title)) return 'Français';
  if (/\bvo\b|engl|\ben\b/.test(title)) return 'Anglais';
  if (/\bvost/.test(title)) return 'VOST';
  return 'non étiquetée';
}

const AUDIO_CODEC_LABELS: Record<string, string> = {
  aac: 'AAC',
  ac3: 'AC-3 (Dolby)',
  eac3: 'E-AC-3 (Dolby+)',
  dts: 'DTS',
  truehd: 'Dolby TrueHD',
  mp3: 'MP3',
  opus: 'Opus',
  flac: 'FLAC',
  vorbis: 'Vorbis',
  pcm_s16le: 'PCM',
};
export function audioCodecLabel(codec: string | null): string {
  if (codec === null) return 'inconnu';
  return AUDIO_CODEC_LABELS[codec.toLowerCase()] ?? codec.toUpperCase();
}

const VIDEO_CODEC_LABELS: Record<string, string> = {
  h264: 'H.264 (AVC)',
  avc: 'H.264 (AVC)',
  hevc: 'H.265 (HEVC)',
  h265: 'H.265 (HEVC)',
  mpeg4: 'MPEG-4',
  mpeg2video: 'MPEG-2',
  vc1: 'VC-1',
  vp9: 'VP9',
  av1: 'AV1',
};
export function videoCodecLabel(codec: string | null): string {
  if (codec === null) return 'inconnu';
  return VIDEO_CODEC_LABELS[codec.toLowerCase()] ?? codec.toUpperCase();
}

const SUBTITLE_CODEC_LABELS: Record<string, string> = {
  subrip: 'SRT (texte)',
  srt: 'SRT (texte)',
  ass: 'ASS/SSA (texte)',
  ssa: 'ASS/SSA (texte)',
  mov_text: 'mov_text (texte)',
  webvtt: 'WebVTT (texte)',
  hdmv_pgs_subtitle: 'PGS (image)',
  pgssub: 'PGS (image)',
  dvd_subtitle: 'VobSub (image)',
  dvdsub: 'VobSub (image)',
  dvb_subtitle: 'DVB (image)',
};
export function subtitleCodecLabel(codec: string | null): string {
  if (codec === null) return 'inconnu';
  return SUBTITLE_CODEC_LABELS[codec.toLowerCase()] ?? codec.toLowerCase();
}

/** Vrai si le sous-titre est TEXTE (extractible en WebVTT) et non bitmap (PGS/VobSub). */
export function isTextSubtitle(codec: string | null): boolean {
  if (codec === null) return false;
  return /subrip|srt|ass|ssa|mov_text|webvtt|text/i.test(codec);
}
