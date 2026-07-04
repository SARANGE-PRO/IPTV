'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { EmptyState } from '@/components/shared/EmptyState';
import { FavoriteButton } from '@/components/shared/FavoriteButton';
import { NowPlaying } from '@/components/live/NowPlaying';
import { ExternalPlayer } from '@/components/player/ExternalPlayer';
import { VideoPlayer } from '@/components/player/VideoPlayer';
import { IconArrowLeft } from '@/components/ui/icons';
import { cn } from '@/lib/cn';
import * as catalogRepository from '@/services/data/catalogService';
import { findChannelVersions } from '@/services/live/channelGroupingService';
import { buildLiveStreamUrl } from '@/services/xtream/xtreamUrls';
import { useAuthStore } from '@/stores/authStore';
import { usePlaybackStore } from '@/stores/playbackStore';
import { useUiSettingsStore } from '@/stores/uiSettingsStore';
import type { ChannelVersion } from '@/types/liveGrouping';
import type { LiveChannel } from '@/types/models';
import { displayChannelName } from '@/utils/displayTitle';
import { supportsNativeHls } from '@/utils/playerSupport';

export default function LiveWatchPage() {
  const { streamId } = useParams<{ streamId: string }>();
  const credentials = useAuthStore((s) => s.credentials);
  const recordLiveWatch = usePlaybackStore((s) => s.recordLiveWatch);
  const showVlcButton = useUiSettingsStore((s) => s.showVlcButton);
  const router = useRouter();
  const [channel, setChannel] = useState<LiveChannel | null | undefined>(undefined);
  const [neighbors, setNeighbors] = useState<{ previous: LiveChannel | null; next: LiveChannel | null }>({
    previous: null,
    next: null,
  });
  const [versions, setVersions] = useState<ChannelVersion[]>([]);
  const [failed, setFailed] = useState(false);
  // Le titre en surimpression s'efface apres quelques secondes pour ne pas
  // recouvrir le bouton plein ecran natif (le nom reste dans l'en-tete au-dessus).
  const [showTitleOverlay, setShowTitleOverlay] = useState(true);
  // Safari (iPhone/iPad/macOS) : Live en HLS .m3u8 natif — il refuse le fMP4
  // progressif de la passerelle. Chrome/Edge : .ts transcode (robuste).
  const [liveExt] = useState<'m3u8' | 'ts'>(() => (supportsNativeHls() ? 'm3u8' : 'ts'));

  useEffect(() => {
    setFailed(false);
    let active = true;
    void catalogRepository.getLiveChannelById(streamId).then((c) => {
      if (active) setChannel(c ?? null);
    });
    return () => {
      active = false;
    };
  }, [streamId]);

  // Ré-affiche le titre au zapping puis l'estompe (laisse le bouton plein écran libre).
  useEffect(() => {
    setShowTitleOverlay(true);
    const timer = setTimeout(() => setShowTitleOverlay(false), 4000);
    return () => clearTimeout(timer);
  }, [streamId]);

  useEffect(() => {
    if (channel === null || channel === undefined) return;
    let active = true;
    void catalogRepository.getLiveChannelNeighbors(channel.categoryId, channel.sortOrder).then((result) => {
      if (active) setNeighbors(result);
    });
    return () => {
      active = false;
    };
  }, [channel]);

  useEffect(() => {
    if (channel !== null && channel !== undefined) {
      recordLiveWatch(channel.id, channel.name, channel.logoUrl);
    }
  }, [channel, recordLiveWatch]);

  // Variantes (HD/FHD/4K/RAW…) de la chaine — pool FR borne, uniquement pour les
  // chaines FR (l'international reste "en vrac", sans selecteur).
  useEffect(() => {
    if (channel === null || channel === undefined || channel.isFrench !== 1) {
      setVersions([]);
      return;
    }
    let active = true;
    void catalogRepository.getLiveChannelsPage({ kind: 'french' }, 0, 4000).then((pool) => {
      if (active) setVersions(findChannelVersions(pool, channel));
    });
    return () => {
      active = false;
    };
  }, [channel]);

  // Player : extension selon le navigateur. VLC : toujours .ts (universel).
  const src = credentials !== null ? buildLiveStreamUrl(credentials, streamId, liveExt) : null;
  const vlcSrc = credentials !== null ? buildLiveStreamUrl(credentials, streamId, 'ts') : null;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6 md:px-8">
      <div className="mb-4 flex items-center gap-3">
        <button
          onClick={() => router.back()}
          aria-label="Retour"
          className="rounded-full bg-ink-800 p-2 text-fg-muted hover:text-fg"
        >
          <IconArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="min-w-0 flex-1 truncate text-lg font-semibold text-fg">
          {channel != null ? displayChannelName(channel.name) : 'Chaîne'}
        </h1>
        <FavoriteButton type="live" itemId={streamId} />
      </div>

      {channel === null ? (
        <EmptyState
          title="Chaîne introuvable"
          hint="Elle a peut-être disparu du catalogue après une synchronisation."
        />
      ) : (
        src !== null && (
          <div className="space-y-4">
            <div className="relative overflow-hidden rounded-2xl">
              <VideoPlayer
                src={src}
                live
                transcode={liveExt === 'ts'}
                contentType="live"
                container={liveExt}
                onError={() => setFailed(true)}
              />
              {/* Titre en surimpression (verre depoli) — s'estompe apres 4 s pour
                  liberer le bouton plein ecran natif. pointer-events-none : les
                  taps atteignent toujours les controles du lecteur. */}
              <div
                className={cn(
                  'pointer-events-none absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-black/60 to-transparent p-3 transition-opacity duration-700',
                  showTitleOverlay ? 'opacity-100' : 'opacity-0',
                )}
              >
                <span className="glass inline-block max-w-[70%] truncate rounded-lg px-2.5 py-1 text-xs font-medium text-fg">
                  {channel != null ? displayChannelName(channel.name) : 'Chaîne'}
                </span>
              </div>
              {/* NB : les fleches de zapping en overlay (top-1/2 sur les bords)
                  ont ete retirees — elles captaient le tap "reveler les controles"
                  du lecteur natif (zapping involontaire). Le zapping reste dispo
                  via les boutons labellises Precedente/Suivante sous le lecteur. */}
            </div>
            <NowPlaying credentials={credentials} streamId={streamId} />
            {versions.length > 1 && (
              <div>
                <p className="mb-2 text-xs font-medium text-fg-muted">Autres versions</p>
                <div className="flex flex-wrap gap-2">
                  {versions.map((version) => (
                    <Link
                      key={version.channel.id}
                      href={`/live/${version.channel.id}`}
                      className={cn(
                        'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                        version.channel.id === streamId
                          ? 'bg-accent text-white'
                          : 'bg-ink-800 text-fg-muted hover:text-fg',
                      )}
                    >
                      {version.label}
                    </Link>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-fg-faint">
                  Une version ne fonctionne pas ? Essaie-en une autre.
                </p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={neighbors.previous === null}
                onClick={() => {
                  if (neighbors.previous !== null) router.push(`/live/${neighbors.previous.id}`);
                }}
                className="min-w-0 rounded-xl bg-ink-800 px-4 py-3 text-left text-xs text-fg-muted transition-colors hover:bg-ink-700 hover:text-fg disabled:opacity-35"
              >
                <span className="block text-[10px] uppercase tracking-wider text-fg-faint">Precedente</span>
                <span className="mt-1 block truncate">
                  {neighbors.previous != null ? displayChannelName(neighbors.previous.name) : 'Indisponible'}
                </span>
              </button>
              <button
                type="button"
                disabled={neighbors.next === null}
                onClick={() => {
                  if (neighbors.next !== null) router.push(`/live/${neighbors.next.id}`);
                }}
                className="min-w-0 rounded-xl bg-ink-800 px-4 py-3 text-right text-xs text-fg-muted transition-colors hover:bg-ink-700 hover:text-fg disabled:opacity-35"
              >
                <span className="block text-[10px] uppercase tracking-wider text-fg-faint">Suivante</span>
                <span className="mt-1 block truncate">
                  {neighbors.next != null ? displayChannelName(neighbors.next.name) : 'Indisponible'}
                </span>
              </button>
            </div>
            {(showVlcButton || failed) && vlcSrc !== null && (
              <ExternalPlayer
                streamUrl={vlcSrc}
                label={failed ? 'Ça ne marche pas ici ? Ouvrir dans VLC' : 'Regarder dans VLC'}
              />
            )}
          </div>
        )
      )}
    </main>
  );
}
