'use client';

import { useEffect, useRef, useState } from 'react';
import { PlayerOverlay } from '@/components/player/PlayerOverlay';
import { usePipPolicy } from '@/hooks/usePipPolicy';
import { cn } from '@/lib/cn';
import { exitPip, isInPip } from '@/services/player/pictureInPicture';
import { startPlaybackSession, type PlayerPhase } from '@/services/player/playbackSession';
import { useUiSettingsStore } from '@/stores/uiSettingsStore';
import type { PlayerErrorAction } from '@/types/nowPlaying';
import type { PlaybackFailure } from '@/types/playbackDiagnostics';
import { secureImageSrc, secureMediaUrl } from '@/utils/secureUrl';

/**
 * Lecteur video isole. HLS natif (Safari iOS/iPadOS) prioritaire ; hls.js
 * charge en lazy uniquement si necessaire. URLs directes vers le serveur
 * Xtream — jamais via Vercel, jamais en cache service worker.
 *
 * La MEME <video> sert a tous les flux successifs (zapping, episode suivant) :
 * iOS n'autorise la lecture avec son qu'apres un geste SUR l'element — un
 * nouvel element a chaque chaine pourrait exiger un nouveau tap.
 *
 * Ce composant ne fait que BRANCHER : la supervision d'un flux (relances,
 * anti-gel, pause subie, hors-ligne, progression) vit dans
 * `services/player/playbackSession` ; le branchement de la source dans
 * `streamSource` ; l'affichage hors lecture dans `PlayerOverlay`.
 */

export interface VideoPlayerProps {
  /** '' = lecteur AU REPOS (aucune session) : la <video> reste montee, vide. */
  src: string;
  poster?: string | null;
  live?: boolean;
  /** Reprise par SEEK (flux seekable : MP4 direct). */
  startAt?: number;
  /** Reprise par OFFSET SERVEUR (flux transcode non-seekable) : la passerelle
   *  demarre a cette position, le flux commence donc a `startOffset`. Le lecteur
   *  ne seek pas et rapporte la progression decalee de cet offset. */
  startOffset?: number;
  /** Duree totale de repli (Xtream/TMDB) quand le player n'expose pas de duree. */
  duration?: number | null;
  /** `force` = flush garanti (pause/fin/pagehide/demontage) : la page doit le
   * relayer a saveProgress pour contourner le throttle, sinon la derniere
   * position est perdue quand iOS gele la PWA en arriere-plan. */
  onProgress?: (positionSec: number, durationSec: number | null, force: boolean) => void;
  onEnded?: () => void;
  /** Echec DEFINITIF (relances automatiques epuisees) : repli VLC, autre version. */
  onError?: (failure: PlaybackFailure) => void;
  /** La lecture (re)demarre : efface un echec signale auparavant. */
  onPlaying?: () => void;
  /**
   * Route le flux via la passerelle (transcodage) et autorise les conteneurs
   * non-natifs (MKV/AVI). Decide par la page appelante selon la sante de la
   * passerelle. Defaut false = lecture directe (MP4/HLS natif Safari).
   */
  transcode?: boolean;
  /**
   * Safari + VOD non-natif : demande a la passerelle un flux HLS (Safari refuse
   * le fMP4 progressif du transcodage). Decide par la page (plan gateway ET HLS
   * natif). Sans effet pour le direct/Chrome.
   */
  preferHls?: boolean;
  /**
   * MKV lu DIRECTEMENT dans le navigateur (coquille HTTP) : fetch depuis
   * l'appareil, remux fMP4 in-app, MediaSource. Decide par la page
   * (plan 'direct-mkv'). Jamais via la passerelle.
   */
  directMkv?: boolean;
  /** Appele si le remux direct echoue (codecs non lus, CORS, MSE) : la page
   *  retombe sur passerelle/VLC. */
  onDirectMkvFailed?: () => void;
  /** Contexte pour le diagnostic d'erreur (bouton "i"). */
  contentType?: 'live' | 'vod' | 'episode';
  container?: string | null;
  /** Classes du cadre (fond noir arrondi qui contient la video). */
  className?: string;
  /** Classes du conteneur racine (cadre + mentions sous le lecteur). */
  rootClassName?: string;
  /** Classes ajoutees a la <video> (ex. remplir l'ecran en paysage). */
  videoClassName?: string;
  /** Recoit l'element <video> au montage (null au demontage) : commandes
   *  externes comme le plein ecran paysage. */
  onVideoElement?: (video: HTMLVideoElement | null) => void;
  /** Vignette (mini-lecteur) : ni commandes natives, ni panneau d'erreur. */
  compact?: boolean;
  /** Alternatives de la page (chaine suivante, VLC…) sur l'ecran d'echec. */
  getErrorActions?: () => PlayerErrorAction[];
}

export function VideoPlayer({
  src,
  poster,
  live = false,
  startAt = 0,
  startOffset = 0,
  duration = null,
  onProgress,
  onEnded,
  onError,
  onPlaying,
  transcode = false,
  preferHls = false,
  directMkv = false,
  onDirectMkvFailed,
  contentType,
  container = null,
  className,
  rootClassName,
  videoClassName,
  onVideoElement,
  compact = false,
  getErrorActions,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  // Lue au lancement d'un flux seulement : changer la langue dans les Reglages
  // ne doit pas recharger ce qui joue (Live compris).
  const preferredLanguage = useUiSettingsStore((s) => s.preferredLanguage);
  const preferredLanguageRef = useRef(preferredLanguage);
  preferredLanguageRef.current = preferredLanguage;
  const pipEnabled = useUiSettingsStore((s) => s.pipEnabled);
  const [phase, setPhase] = useState<PlayerPhase>('loading');
  const [failure, setFailure] = useState<PlaybackFailure | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [limitedSeek, setLimitedSeek] = useState(false);
  // Flux HTTP -> passerelle HTTPS (Xtream HTTP-only + mixed-content). C'est la
  // passerelle qui choisit passthrough (MP4/segments) ou remux/transcodage
  // (MKV/HEVC, live .ts). Le drapeau `transcode` autorise les conteneurs
  // non-natifs, contextualise le diagnostic et, sur une page HTTP (coquille
  // infra/http-shell, lecture directe par defaut), force malgre tout le passage
  // par la passerelle : c'est son transcodage qu'on veut.
  const idle = src === '';
  const streamUrl = secureMediaUrl(src, { hls: preferHls, start: startOffset, transcode });
  const posterUrl = secureImageSrc(poster);

  // Valeurs COURANTES lues par la session en cours (sans la relancer).
  const latest = useRef({ onProgress, onEnded, onError, onPlaying, onDirectMkvFailed, startAt, startOffset, live, duration });
  latest.current = { onProgress, onEnded, onError, onPlaying, onDirectMkvFailed, startAt, startOffset, live, duration };
  /** Derniere position VOD connue de CE flux : une relance (auto ou bouton
   *  Reessayer) y reprend au lieu de repartir du point d'ouverture. */
  const lastPositionRef = useRef<{ url: string; position: number } | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (video === null) return;
    if (idle) {
      // Fin de session : la source a ete retiree par le nettoyage du flux
      // precedent ; on garde l'ELEMENT (autorisation son iOS a la prochaine
      // lecture) mais aucune fenetre PiP ne doit survivre a la session.
      setPhase('ready');
      setFailure(null);
      setLimitedSeek(false);
      if (isInPip(video)) exitPip(video);
      return;
    }
    setFailure(null);
    const props = latest.current;
    return startPlaybackSession(
      video,
      {
        url: streamUrl,
        rawSrc: src,
        live: props.live,
        startOffset: props.startOffset,
        transcode,
        preferHls,
        directMkv,
        startAt: () => latest.current.startAt,
        duration: () => latest.current.duration,
        preferredLanguage: () => preferredLanguageRef.current,
        progressSink: () => latest.current.onProgress,
        memo: {
          get: () => lastPositionRef.current,
          set: (value) => {
            lastPositionRef.current = value;
          },
        },
      },
      {
        setPhase,
        setLimitedSeek,
        onFailure: (f) => {
          setFailure(f);
          latest.current.onError?.(f);
        },
        onPlaying: () => latest.current.onPlaying?.(),
        onEnded: () => latest.current.onEnded?.(),
        onDirectMkvFailed: () => latest.current.onDirectMkvFailed?.(),
      },
    );
    // src / preferHls / transcode sont deja dans streamUrl (URL calculee).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamUrl, idle, attempt, directMkv]);

  // Expose la <video> (stable sur toute la vie du composant, zapping compris).
  useEffect(() => {
    if (onVideoElement === undefined) return;
    onVideoElement(videoRef.current);
    return () => onVideoElement(null);
  }, [onVideoElement]);

  usePipPolicy(videoRef, pipEnabled);

  return (
    <div className={rootClassName}>
      <div className={cn('relative overflow-hidden rounded-2xl bg-black', className)}>
        <video
          ref={videoRef}
          // Echec definitif : pas de barre native SOUS l'ecran d'echec (boutons superposes).
          controls={!compact && phase !== 'error'}
          disablePictureInPicture={!pipEnabled}
          playsInline
          autoPlay
          poster={posterUrl ?? undefined}
          className={cn('aspect-video w-full bg-black', videoClassName)}
        />
        <PlayerOverlay
          phase={phase}
          failure={failure}
          compact={compact}
          onRetry={() => setAttempt((a) => a + 1)}
          getErrorActions={getErrorActions}
          context={{ type: contentType ?? (live ? 'live' : 'vod'), container, transcode }}
        />
      </div>
      {limitedSeek && !live && !compact && phase !== 'error' && (
        <p className="mt-2 text-[11px] text-fg-faint">
          Ce flux ne permet pas toujours une reprise précise (lecture progressive).
        </p>
      )}
    </div>
  );
}
