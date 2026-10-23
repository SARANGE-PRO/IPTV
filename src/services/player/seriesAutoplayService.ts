import { nextEpisode } from '@/services/media/episodeService';
import { resolvePlaybackMode } from '@/services/player/playbackPlanService';
import { buildSeriesEpisodeUrl } from '@/services/xtream/xtreamUrls';
import type { Episode } from '@/types/models';
import type { NowPlayingMedia, PlayerContinuation, PlayerHandlers, PlayerSession, PlayerSource } from '@/types/nowPlaying';
import type { XtreamCredentials } from '@/types/xtream';
import { supportsNativeHls } from '@/utils/playerSupport';

/**
 * Enchainement d'episodes SANS la fiche serie (mini-lecteur, ecran verrouille) :
 * la fiche confie au lecteur unique un « episode suivant » autonome, qui
 * construit la lecture suivante (flux, plan de lecture, progression) et
 * transmet a son tour l'episode d'apres. Les actions de stockage (progression,
 * episode termine, lancement) sont fournies par l'appelant : aucun store ici.
 */

export interface SeriesPlaybackContext {
  credentials: XtreamCredentials;
  seriesId: string;
  /** Nom fournisseur (libelle de progression, comme la fiche). */
  seriesName: string;
  /** Titre d'affichage (mini-lecteur, ecran verrouille). */
  seriesTitle: string | null;
  posterUrl: string | null;
  episodes: readonly Episode[];
}

export interface SeriesPlaybackDeps {
  saveProgress: (input: {
    type: 'episode';
    itemId: string;
    seriesId: string;
    positionSec: number;
    durationSec: number | null;
    label: string;
    posterUrl: string | null;
  }, opts: { force: boolean }) => void;
  markFinished: (episodeId: string) => void;
  play: (session: PlayerSession, handlers: PlayerHandlers) => void;
  sessionKey: (media: NowPlayingMedia, source: PlayerSource) => string;
}

export function episodeLabel(seriesName: string, ep: Episode): string {
  return `${seriesName} · S${ep.seasonNumber}E${ep.episodeNumber}`;
}

/** Lecture complete d'un episode (null : seul VLC saurait le lire). */
async function buildEpisodePlayback(
  ctx: SeriesPlaybackContext,
  deps: SeriesPlaybackDeps,
  ep: Episode,
): Promise<{ session: PlayerSession; handlers: PlayerHandlers } | null> {
  const mode = await resolvePlaybackMode(ep.containerExtension);
  if (mode === 'vlc-only') return null;
  const media: NowPlayingMedia = {
    kind: 'episode',
    ownerId: ctx.seriesId,
    itemId: ep.id,
    title: `S${ep.seasonNumber} E${ep.episodeNumber} · ${ep.title}`,
    subtitle: ctx.seriesTitle,
    artwork: ep.imageUrl ?? ctx.posterUrl,
  };
  const source: PlayerSource = {
    src: buildSeriesEpisodeUrl(ctx.credentials, ep.id, ep.containerExtension),
    transcode: mode === 'gateway',
    directMkv: mode === 'direct-mkv',
    preferHls: mode === 'gateway' && supportsNativeHls(),
    contentType: 'episode',
    container: ep.containerExtension,
    startAt: 0,
    startOffset: 0,
    duration: ep.durationSecs,
    poster: ep.imageUrl ?? ctx.posterUrl,
  };
  const handlers: PlayerHandlers = {
    onProgress: (positionSec, durationSec, force) =>
      deps.saveProgress(
        {
          type: 'episode',
          itemId: ep.id,
          seriesId: ctx.seriesId,
          positionSec,
          durationSec,
          label: episodeLabel(ctx.seriesName, ep),
          posterUrl: ctx.posterUrl,
        },
        { force },
      ),
    onEnded: () => deps.markFinished(ep.id),
    next: nextEpisodeContinuation(ctx, deps, ep),
  };
  return { session: { key: deps.sessionKey(media, source), media, source }, handlers };
}

/** « Episode suivant » de `current` (null : dernier episode). */
export function nextEpisodeContinuation(
  ctx: SeriesPlaybackContext,
  deps: SeriesPlaybackDeps,
  current: Episode,
): PlayerContinuation | null {
  const next = nextEpisode(ctx.episodes, current.id);
  if (next === null) return null;
  return {
    label: `S${next.seasonNumber}E${next.episodeNumber}`,
    start: async () => {
      const playback = await buildEpisodePlayback(ctx, deps, next).catch(() => null);
      if (playback === null) return false;
      deps.play(playback.session, playback.handlers);
      return true;
    },
  };
}
