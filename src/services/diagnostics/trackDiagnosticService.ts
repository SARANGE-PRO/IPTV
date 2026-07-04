import * as catalogRepository from '@/db/repositories/catalogRepository';
import { getSeriesInfo } from '@/services/xtream/xtreamApi';
import { buildSeriesEpisodeUrl, buildVodStreamUrl } from '@/services/xtream/xtreamUrls';
import { isGatewayConfigured, isGatewayHealthy } from '@/services/player/mediaGatewayService';
import type {
  CountRow,
  ProbeResponse,
  ProbeStreamInfo,
  TrackDiagnostic,
  TrackSectionStats,
} from '@/types/trackDiagnostics';
import type { XtreamCredentials, XtreamSeriesInfo } from '@/types/xtream';
import {
  audioCodecLabel,
  isHdr,
  isTenBit,
  isTextSubtitle,
  langLabel,
  probeStreamUrl,
  resolutionBucket,
  subtitleCodecLabel,
  videoCodecLabel,
} from './trackProbeService';

/**
 * Diagnostic PISTES & QUALITE : sonde un ECHANTILLON de films et d'episodes via
 * ffprobe (passerelle) pour reveler ce que Xtream cache — multi-audio, langues,
 * sous-titres integres, 10-bit/HDR, resolutions reelles. Sondes SEQUENTIELLES
 * (une connexion a la fois) : un compte max_connections:1 ne tolere pas deux
 * flux simultanes. Rapport AGREGE + ANONYMISE (aucune URL/identifiant).
 */

export interface TrackDiagnosticOptions {
  movieSample?: number;
  seriesSample?: number;
  onProgress?: (done: number, total: number, phase: string) => void;
}

interface ProbeTask {
  section: 'vod' | 'series';
  container: string | null;
  url: string;
}

function monthLabel(): string {
  return new Date().toISOString().slice(0, 7); // "2026-07"
}

function toCountRows(map: Map<string, number>): CountRow[] {
  return [...map.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

function bump(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

/** Premier episode jouable d'une reponse get_series_info (2 formes possibles). */
function firstEpisode(info: XtreamSeriesInfo): { id: string; container: string | null } | null {
  const eps = info.episodes;
  if (eps === undefined) return null;
  const lists = Array.isArray(eps) ? eps : Object.values(eps);
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const ep of list) {
      if (ep?.id !== undefined && ep.id !== null) {
        return { id: String(ep.id), container: ep.container_extension ?? null };
      }
    }
  }
  return null;
}

function emptySection(section: 'vod' | 'series'): {
  section: 'vod' | 'series';
  sampled: number;
  probed: number;
  failed: number;
  containers: Map<string, number>;
  videoCodecs: Map<string, number>;
  resolutions: Map<string, number>;
  tenBit: number;
  hdr: number;
  audioTrackCounts: Map<string, number>;
  multiAudio: number;
  audioLanguages: Map<string, number>;
  audioCodecs: Map<string, number>;
  withSubs: number;
  subtitleLanguages: Map<string, number>;
  subtitleCodecs: Map<string, number>;
  examples: string[];
} {
  return {
    section,
    sampled: 0,
    probed: 0,
    failed: 0,
    containers: new Map(),
    videoCodecs: new Map(),
    resolutions: new Map(),
    tenBit: 0,
    hdr: 0,
    audioTrackCounts: new Map(),
    multiAudio: 0,
    audioLanguages: new Map(),
    audioCodecs: new Map(),
    withSubs: 0,
    subtitleLanguages: new Map(),
    subtitleCodecs: new Map(),
    examples: [],
  };
}

type Accumulator = ReturnType<typeof emptySection>;

function audioCountLabel(n: number): string {
  if (n <= 0) return '0 piste';
  if (n === 1) return '1 piste';
  if (n === 2) return '2 pistes';
  return '3+ pistes';
}

/** Integre une sonde reussie dans l'accumulateur de section. */
function accumulate(acc: Accumulator, streams: ProbeStreamInfo[], container: string | null): void {
  acc.probed += 1;
  if (container !== null && container !== '') bump(acc.containers, container.toLowerCase());

  const video = streams.find((s) => s.type === 'video') ?? null;
  const audio = streams.filter((s) => s.type === 'audio');
  const subs = streams.filter((s) => s.type === 'subtitle');

  let resBucket = 'inconnue';
  if (video !== null) {
    bump(acc.videoCodecs, videoCodecLabel(video.codec));
    resBucket = resolutionBucket(video.height);
    bump(acc.resolutions, resBucket);
    if (isTenBit(video.pix_fmt)) acc.tenBit += 1;
    if (isHdr(video.color_transfer)) acc.hdr += 1;
  }

  bump(acc.audioTrackCounts, audioCountLabel(audio.length));
  if (audio.length >= 2) acc.multiAudio += 1;
  const audioLangs: string[] = [];
  const seenLang = new Set<string>();
  for (const a of audio) {
    const lang = langLabel(a);
    bump(acc.audioLanguages, lang);
    bump(acc.audioCodecs, audioCodecLabel(a.codec));
    if (!seenLang.has(lang)) {
      seenLang.add(lang);
      audioLangs.push(lang);
    }
  }

  if (subs.length >= 1) acc.withSubs += 1;
  const subLangs: string[] = [];
  const seenSub = new Set<string>();
  for (const s of subs) {
    const lang = langLabel(s);
    bump(acc.subtitleLanguages, lang);
    bump(acc.subtitleCodecs, subtitleCodecLabel(s.codec));
    if (!seenSub.has(lang)) {
      seenSub.add(lang);
      subLangs.push(lang);
    }
  }

  if (acc.examples.length < 6) {
    const codecLabel = video !== null ? videoCodecLabel(video.codec) : 'video ?';
    const tenBitTag = video !== null && isTenBit(video.pix_fmt) ? ' 10-bit' : '';
    const audioPart = `${audio.length} audio${audioLangs.length > 0 ? ` (${audioLangs.slice(0, 4).join(', ')})` : ''}`;
    const subPart = subs.length > 0 ? ` · ${subs.length} st (${subLangs.slice(0, 4).join(', ')})` : ' · 0 st';
    const example = `${codecLabel}${tenBitTag} ${resBucket} · ${audioPart}${subPart}`;
    if (!acc.examples.includes(example)) acc.examples.push(example);
  }
}

function finalizeSection(acc: Accumulator): TrackSectionStats {
  return {
    section: acc.section,
    sampled: acc.sampled,
    probed: acc.probed,
    failed: acc.failed,
    containers: toCountRows(acc.containers),
    videoCodecs: toCountRows(acc.videoCodecs),
    resolutions: toCountRows(acc.resolutions),
    tenBit: acc.tenBit,
    hdr: acc.hdr,
    audioTrackCounts: toCountRows(acc.audioTrackCounts),
    multiAudio: acc.multiAudio,
    audioLanguages: toCountRows(acc.audioLanguages),
    audioCodecs: toCountRows(acc.audioCodecs),
    withSubs: acc.withSubs,
    subtitleLanguages: toCountRows(acc.subtitleLanguages),
    subtitleCodecs: toCountRows(acc.subtitleCodecs),
    examples: acc.examples,
  };
}

function pct(part: number, whole: number): number {
  return whole <= 0 ? 0 : Math.round((part / whole) * 100);
}

/** Conclusions lisibles agregees sur films + episodes. */
function buildFindings(sections: TrackSectionStats[], streamsTextSubs: number, streamsBitmapSubs: number): string[] {
  const findings: string[] = [];
  const probed = sections.reduce((n, s) => n + s.probed, 0);
  if (probed === 0) {
    findings.push(
      'Aucun flux sondé : passerelle éteinte ou flux indisponibles. Démarre la passerelle (PC) puis relance.',
    );
    return findings;
  }
  const multiAudio = sections.reduce((n, s) => n + s.multiAudio, 0);
  const withSubs = sections.reduce((n, s) => n + s.withSubs, 0);
  const tenBit = sections.reduce((n, s) => n + s.tenBit, 0);
  const hdr = sections.reduce((n, s) => n + s.hdr, 0);

  findings.push(
    `${pct(multiAudio, probed)}% des ${probed} flux sondés ont ≥2 pistes audio (VF+VO ou multi-langue).`,
  );
  if (withSubs > 0) {
    const note =
      streamsBitmapSubs > 0 && streamsTextSubs === 0
        ? ' — mais bitmap (PGS/VobSub), non convertibles en texte : incrustation requise.'
        : streamsBitmapSubs > 0
          ? ' (mélange texte + bitmap).'
          : ' au format texte (convertibles en WebVTT).';
    findings.push(`${pct(withSubs, probed)}% ont des sous-titres intégrés${note}`);
  } else {
    findings.push('Aucun sous-titre intégré détecté dans l’échantillon (probable pistes externes ou absentes).');
  }
  if (tenBit > 0) {
    findings.push(
      `${tenBit} flux en 10-bit (HEVC) : illisibles nativement sur iPhone → transcodage H.264 obligatoire (déjà géré par la passerelle).`,
    );
  }
  if (hdr > 0) findings.push(`${hdr} flux HDR/HLG détectés.`);

  findings.push(
    'Limite actuelle : le transcodage passerelle ne conserve qu’UNE piste audio et JETTE les sous-titres — c’est ce que la prochaine étape (catalogue premium) va corriger.',
  );
  return findings;
}

/**
 * Genere le diagnostic pistes. Sonde SEQUENTIELLEMENT un echantillon de films et
 * d'episodes de series. Ne jette jamais sur un flux mort (compte en failed).
 */
export async function generateTrackDiagnostic(
  credentials: XtreamCredentials,
  options: TrackDiagnosticOptions = {},
): Promise<TrackDiagnostic> {
  const movieSample = options.movieSample ?? 10;
  const seriesSample = options.seriesSample ?? 4;
  const errors: string[] = [];

  const configured = isGatewayConfigured();
  const healthy = configured ? await isGatewayHealthy() : false;

  if (!configured || !healthy) {
    return {
      generatedAtLabel: monthLabel(),
      anonymized: true,
      gateway: { configured, healthy },
      sampleSize: 0,
      sections: [],
      findings: [
        configured
          ? 'Passerelle configurée mais injoignable : démarre le PC/serveur, puis relance le diagnostic.'
          : 'Aucune passerelle configurée : la sonde ffprobe est indisponible (NEXT_PUBLIC_MEDIA_GATEWAY_URL).',
      ],
      errors,
    };
  }

  // --- Construction des taches de sonde ---------------------------------------
  const tasks: ProbeTask[] = [];
  const vodAcc = emptySection('vod');
  const seriesAcc = emptySection('series');

  try {
    const movies = await catalogRepository.getMoviesSample(movieSample);
    for (const m of movies) {
      tasks.push({
        section: 'vod',
        container: m.containerExtension,
        url: buildVodStreamUrl(credentials, m.id, m.containerExtension),
      });
      vodAcc.sampled += 1;
    }
  } catch {
    errors.push('Échantillon films indisponible (catalogue non synchronisé ?).');
  }

  try {
    const seriesList = await catalogRepository.getSeriesSample(seriesSample);
    for (const s of seriesList) {
      try {
        const info = await getSeriesInfo(credentials, s.id);
        const ep = firstEpisode(info);
        if (ep === null) continue;
        tasks.push({
          section: 'series',
          container: ep.container,
          url: buildSeriesEpisodeUrl(credentials, ep.id, ep.container),
        });
        seriesAcc.sampled += 1;
      } catch {
        // serie sans info exploitable : ignoree
      }
    }
  } catch {
    errors.push('Échantillon séries indisponible.');
  }

  // --- Sondes SEQUENTIELLES (une connexion a la fois) -------------------------
  const total = tasks.length;
  let textSubs = 0;
  let bitmapSubs = 0;
  for (let i = 0; i < tasks.length; i += 1) {
    const task = tasks[i];
    if (task === undefined) continue;
    const acc = task.section === 'vod' ? vodAcc : seriesAcc;
    options.onProgress?.(i, total, task.section === 'vod' ? 'Films' : 'Séries');
    const result: ProbeResponse = await probeStreamUrl(task.url);
    if (!result.ok || result.streams === undefined) {
      acc.failed += 1;
      continue;
    }
    accumulate(acc, result.streams, task.container);
    for (const s of result.streams) {
      if (s.type !== 'subtitle') continue;
      if (isTextSubtitle(s.codec)) textSubs += 1;
      else bitmapSubs += 1;
    }
  }
  options.onProgress?.(total, total, 'Terminé');

  const sections: TrackSectionStats[] = [];
  if (vodAcc.sampled > 0) sections.push(finalizeSection(vodAcc));
  if (seriesAcc.sampled > 0) sections.push(finalizeSection(seriesAcc));

  return {
    generatedAtLabel: monthLabel(),
    anonymized: true,
    gateway: { configured, healthy },
    sampleSize: total,
    sections,
    findings: buildFindings(sections, textSubs, bitmapSubs),
    errors,
  };
}
