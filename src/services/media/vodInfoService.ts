import { parseDurationToSeconds } from '@/services/player/mediaDurationService';
import * as xtreamApi from '@/services/xtream/xtreamApi';
import type { XtreamCredentials, XtreamVodInfo } from '@/types/xtream';
import { youtubeId } from '@/utils/youtube';

/**
 * Complements d'une fiche film lus chez le panel (`get_vod_info`) : synopsis,
 * visuels, duree, bande-annonce. Jamais indispensables (la fiche s'affiche
 * sans eux) ; TMDB reste prioritaire a l'affichage.
 */
export interface VodExtras {
  plot: string | null;
  posterUrl: string | null;
  backdropUrl: string | null;
  durationSecs: number | null;
  trailerKey: string | null;
}

export const EMPTY_VOD_EXTRAS: VodExtras = {
  plot: null,
  posterUrl: null,
  backdropUrl: null,
  durationSecs: null,
  trailerKey: null,
};

/** Texte vide ou blanc = absent (certains panels renvoient "" partout). */
function text(value: string | null | undefined): string | null {
  const v = value?.trim() ?? '';
  return v === '' ? null : v;
}

/** Normalisation PURE de la reponse panel (testee : tests/vodInfo.test.ts). */
export function normalizeVodInfo(raw: XtreamVodInfo): VodExtras {
  const info = raw.info;
  if (info === undefined) return EMPTY_VOD_EXTRAS;
  const backdrop = Array.isArray(info.backdrop_path) ? info.backdrop_path[0] : info.backdrop_path;
  return {
    plot: text(info.plot) ?? text(info.description),
    posterUrl: text(info.movie_image) ?? text(info.cover),
    backdropUrl: text(backdrop),
    // duration_secs a "0" chez certains panels : on retombe alors sur "01:52:00".
    durationSecs: parseDurationToSeconds(info.duration_secs ?? null) ?? parseDurationToSeconds(info.duration ?? null),
    trailerKey: youtubeId(info.youtube_trailer ?? null),
  };
}

export async function loadVodExtras(credentials: XtreamCredentials, vodId: string): Promise<VodExtras> {
  return normalizeVodInfo(await xtreamApi.getVodInfo(credentials, vodId));
}
