'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { EmptyState } from '@/components/shared/EmptyState';
import { ArrangeButton } from '@/components/favorites/ArrangeButton';
import { FavoriteButton } from '@/components/shared/FavoriteButton';
import { NowPlaying } from '@/components/live/NowPlaying';
import { ExternalPlayer, launchVlc } from '@/components/player/ExternalPlayer';
import { PlayerSlot } from '@/components/player/host/PlayerSlot';
import { IconArrowLeft } from '@/components/ui/icons';
import { useLandscapeFullscreen } from '@/hooks/useLandscapeFullscreen';
import { useLineupLogos } from '@/hooks/useLineupLogos';
import { useLineupNames } from '@/hooks/useLineupNames';
import { useMediaSession } from '@/hooks/useMediaSession';
import { cn } from '@/lib/cn';
import * as catalogRepository from '@/services/data/catalogService';
import { getChannelVersions, getZapNeighbors } from '@/services/live/liveZappingService';
import { isGatewayConfigured } from '@/services/player/mediaGatewayService';
import { buildLiveStreamUrl } from '@/services/xtream/xtreamUrls';
import { useAuthStore } from '@/stores/authStore';
import { useFavoritesStore } from '@/stores/favoritesStore';
import { usePlaybackStore } from '@/stores/playbackStore';
import { cleanChannelDisplay } from '@/services/live/channelNormalizer';
import { usePlayerStore } from '@/stores/playerStore';
import { useUiSettingsStore } from '@/stores/uiSettingsStore';
import type { ChannelVersion } from '@/types/liveGrouping';
import type { LiveChannel } from '@/types/models';
import { LIVE_HREF, liveHref } from '@/utils/appRoutes';
import { canGoBack } from '@/utils/navigation';
import { displayChannelName } from '@/utils/displayTitle';
import { supportsNativeHls } from '@/utils/playerSupport';

/** Lecture d'une chaine : `/live/watch?id=<streamId>` (route statique, voir
 *  utils/appRoutes). Suspense : exige par useSearchParams au prerendu. */
export default function LiveWatchPage() {
  return (
    <Suspense fallback={null}>
      <LiveWatch />
    </Suspense>
  );
}

function LiveWatch() {
  const streamId = useSearchParams().get('id') ?? '';
  const credentials = useAuthStore((s) => s.credentials);
  const recordLiveWatch = usePlaybackStore((s) => s.recordLiveWatch);
  const recentChannels = usePlaybackStore((s) => s.recentChannels);
  const showVlcButton = useUiSettingsStore((s) => s.showVlcButton);
  const router = useRouter();
  const [channel, setChannel] = useState<LiveChannel | null | undefined>(undefined);
  const [neighbors, setNeighbors] = useState<{ previous: LiveChannel | null; next: LiveChannel | null }>({
    previous: null,
    next: null,
  });
  const [versions, setVersions] = useState<ChannelVersion[]>([]);
  // Liste parcourue par Precedente / Suivante (« TNT », onglet…), null = categorie.
  const [zapLabel, setZapLabel] = useState<string | null>(null);
  // <video> du lecteur unique, SEULEMENT si c'est cette chaine qui joue
  // (sinon le plein ecran paysage piloterait un film en mini-lecteur).
  const video = usePlayerStore((s) =>
    s.session?.media.kind === 'live' && s.session.media.ownerId === streamId ? s.video : null,
  );
  // Echec definitif de CETTE chaine (le lecteur l'efface s'il repart).
  const failed = usePlayerStore(
    (s) => s.failed && s.session?.media.kind === 'live' && s.session.media.ownerId === streamId,
  );
  const [failoverNotice, setFailoverNotice] = useState<string | null>(null);
  // Telephone a l'horizontale : 1er tap = lecteur plein ecran natif.
  const { landscape, fullscreen } = useLandscapeFullscreen(video);
  const [showFullscreenHint, setShowFullscreenHint] = useState(false);
  // Le titre en surimpression s'efface apres quelques secondes pour ne pas
  // recouvrir le bouton plein ecran natif (le nom reste dans l'en-tete au-dessus).
  const [showTitleOverlay, setShowTitleOverlay] = useState(true);
  // Safari (iPhone/iPad/macOS) : Live en HLS .m3u8 natif. Ailleurs : .ts
  // transcode si une passerelle est configuree, sinon .m3u8 via hls.js (le
  // .ts brut n'est lu par aucun <video>).
  const [liveExt] = useState<'m3u8' | 'ts'>(() =>
    supportsNativeHls() || !isGatewayConfigured() ? 'm3u8' : 'ts',
  );

  // Zapper REMPLACE l'entree d'historique : « Retour » ramene a la liste, pas
  // a chaque chaine traversee.
  const zapTo = useCallback((id: string) => router.replace(liveHref(id)), [router]);

  // Bascule automatique : une version qui ne repart pas (relances du lecteur
  // epuisees) cede la place a la version suivante de la meme chaine. Chaque
  // version n'est tentee qu'une fois ; un zapping manuel remet a zero.
  const mountedRef = useRef(false);
  const triedRef = useRef<Set<string>>(new Set());
  const failoverTargetRef = useRef<string | null>(null);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  useEffect(() => {
    if (failoverTargetRef.current !== streamId) {
      triedRef.current = new Set();
      setFailoverNotice(null);
    }
    failoverTargetRef.current = null;
    triedRef.current.add(streamId);
  }, [streamId]);
  useEffect(() => {
    if (failoverNotice === null) return;
    const timer = setTimeout(() => setFailoverNotice(null), 6000);
    return () => clearTimeout(timer);
  }, [failoverNotice]);

  const handlePlaybackFailure = () => {
    // Page quittee (lecture en mini-lecteur) : ne jamais y ramener l'utilisateur.
    if (!mountedRef.current) return;
    const next = versions.find((v) => !triedRef.current.has(v.channel.id));
    if (next === undefined) return;
    const current = versions.find((v) => v.channel.id === streamId);
    failoverTargetRef.current = next.channel.id;
    setFailoverNotice(`${current?.label ?? 'Cette version'} ne répond pas — passage automatique sur ${next.label}.`);
    zapTo(next.channel.id);
  };

  useEffect(() => {
    if (streamId === '') {
      setChannel(null);
      return;
    }
    let active = true;
    void catalogRepository
      .getLiveChannelById(streamId)
      .then((c) => {
        if (active) setChannel(c ?? null);
      })
      .catch(() => {
        // Stockage indisponible : le flux (construit depuis l'id) joue quand meme.
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

  // Indication « touchez pour le plein ecran » a chaque passage en paysage.
  useEffect(() => {
    if (!landscape || fullscreen) {
      setShowFullscreenHint(false);
      return;
    }
    setShowFullscreenHint(true);
    const timer = setTimeout(() => setShowFullscreenHint(false), 3000);
    return () => clearTimeout(timer);
  }, [landscape, fullscreen]);

  // Voisins JOUABLES (separateurs sautes, en boucle dans la categorie).
  useEffect(() => {
    if (channel === null || channel === undefined) return;
    let active = true;
    void getZapNeighbors(channel)
      .then((result) => {
        if (!active) return;
        setNeighbors(result);
        setZapLabel(result.label);
      })
      .catch(() => {
        if (active) setNeighbors({ previous: null, next: null });
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

  // Variantes (HD/FHD/4K/RAW…) de la chaine — pool FR borne et mis en cache,
  // uniquement pour les chaines FR (l'international reste "en vrac").
  useEffect(() => {
    if (channel === null || channel === undefined) {
      setVersions([]);
      return;
    }
    let active = true;
    void getChannelVersions(channel)
      .then((list) => {
        if (active) setVersions(list);
      })
      .catch(() => {
        if (active) setVersions([]);
      });
    return () => {
      active = false;
    };
  }, [channel]);

  // Noms de la grille FR (« CNews » plutot que « FR| CNEWS ») : titre, ecran
  // verrouille, boutons de zapping.
  // Chaine regardee juste avant (touche « rappel » des telecommandes) : la plus
  // recente des recents qui n'est pas une version de la chaine en cours.
  const currentIds = new Set([streamId, ...versions.map((v) => v.channel.id)]);
  const recall = recentChannels.find((e) => !currentIds.has(e.itemId)) ?? null;

  const lineupNames = useLineupNames(
    [streamId, neighbors.previous?.id, neighbors.next?.id, recall?.itemId].filter(
      (id): id is string => id != null && id !== '',
    ),
  );
  const recallName =
    recall !== null ? (lineupNames.get(recall.itemId) ?? (cleanChannelDisplay(recall.label ?? '') || 'Chaîne')) : null;

  // Favori au niveau de la CHAINE (comme la liste) : apres une bascule HD -> FHD,
  // le coeur reste plein et ne cree pas un 2e favori « TF1 ».
  const favoriteId = useFavoritesStore(
    (s) => [streamId, ...versions.map((v) => v.channel.id)].find((id) => s.ids.live.has(id)) ?? null,
  );
  const ownerId = favoriteId ?? streamId;
  const nameOf = (c: LiveChannel) => lineupNames.get(c.id) ?? displayChannelName(c.name);
  const channelTitle = channel != null ? nameOf(channel) : 'Chaîne';
  // Visuel ecran verrouille / mini-lecteur : meilleur logo parmi les versions.
  const lineupLogos = useLineupLogos(streamId !== '' ? [streamId] : []);
  const artwork = lineupLogos.get(streamId)?.[0] ?? channel?.logoUrl ?? null;
  const nextId = neighbors.next?.id ?? null;
  const previousId = neighbors.previous?.id ?? null;
  // Ecran verrouille / Centre de controle / AirPods : ⏮ ⏭ = chaine precedente /
  // suivante (au lieu de ±15 s, sans objet en direct).
  useMediaSession(
    video !== null && channel != null ? { title: channelTitle, subtitle: 'En direct', artwork } : null,
    {
      onNext: nextId !== null ? () => zapTo(nextId) : null,
      onPrevious: previousId !== null ? () => zapTo(previousId) : null,
    },
  );

  // Player : extension selon le navigateur. VLC : toujours .ts (universel).
  const src = credentials !== null && streamId !== '' ? buildLiveStreamUrl(credentials, streamId, liveExt) : null;
  const vlcSrc = credentials !== null && streamId !== '' ? buildLiveStreamUrl(credentials, streamId, 'ts') : null;

  // Ouverte directement (PWA rouverte sur la chaine) : pas d'historique.
  const goBack = () => (canGoBack() ? router.back() : router.replace(LIVE_HREF));

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6 md:px-8">
      <div className="mb-4 flex items-center gap-3 phone-land:hidden">
        <button
          onClick={goBack}
          aria-label="Retour"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-ink-800 text-fg-muted hover:text-fg"
        >
          <IconArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="min-w-0 flex-1 truncate text-lg font-semibold text-fg">
          {channelTitle}
        </h1>
        {streamId !== '' && <ArrangeButton type="live" itemId={ownerId} title={channelTitle} />}
        {streamId !== '' && <FavoriteButton type="live" itemId={ownerId} title={channelTitle} />}
      </div>

      {channel === null ? (
        <EmptyState
          title="Chaîne introuvable"
          hint="Elle a peut-être disparu du catalogue après une synchronisation."
        />
      ) : (
        src !== null && (
          <div className="space-y-4">
            {/* Telephone a l'horizontale : le lecteur couvre tout l'ecran (CSS
                seul — iOS refuse le plein ecran natif sans tap). Meme <video>,
                donc la lecture continue sans coupure en tournant l'appareil. */}
            <div
              className={cn(
                'relative',
                'phone-land:fixed phone-land:inset-0 phone-land:z-[60] phone-land:rounded-none phone-land:bg-black',
                'phone-land:pb-[env(safe-area-inset-bottom)] phone-land:pl-[env(safe-area-inset-left)] phone-land:pr-[env(safe-area-inset-right)]',
              )}
            >
              <PlayerSlot
                src={src}
                live
                transcode={liveExt === 'ts'}
                contentType="live"
                container={liveExt}
                onError={handlePlaybackFailure}
                errorActions={[
                  ...(nextId !== null ? [{ label: 'Chaîne suivante', onSelect: () => zapTo(nextId) }] : []),
                  ...(showVlcButton && vlcSrc !== null
                    ? [{ label: 'Ouvrir dans VLC', onSelect: () => launchVlc(vlcSrc) }]
                    : []),
                ]}
                layout="live"
                className="phone-land:h-full"
                media={{
                  kind: 'live',
                  ownerId: streamId,
                  itemId: streamId,
                  title: channelTitle,
                  subtitle: 'En direct',
                  artwork,
                }}
                onMinimize={goBack}
                onSwipeNext={nextId !== null ? () => zapTo(nextId) : null}
                onSwipePrevious={previousId !== null ? () => zapTo(previousId) : null}
              >
                {/* Titre en surimpression (verre depoli) — s'estompe apres 4 s pour
                    liberer le bouton plein ecran natif. pointer-events-none : les
                    taps atteignent toujours les controles du lecteur. */}
                <div
                  className={cn(
                    'pointer-events-none absolute inset-x-0 top-0 z-10 rounded-t-2xl bg-gradient-to-b from-black/60 to-transparent p-3 transition-opacity duration-700 phone-land:rounded-none',
                    'phone-land:pl-[calc(env(safe-area-inset-left)+0.75rem)]',
                    showTitleOverlay ? 'opacity-100' : 'opacity-0',
                  )}
                >
                  <span className="glass inline-block max-w-[70%] truncate rounded-lg px-2.5 py-1 text-xs font-medium text-fg">
                    {channelTitle}
                  </span>
                </div>
                <div
                  className={cn(
                    'pointer-events-none absolute inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] z-10 hidden justify-center transition-opacity duration-500 phone-land:flex',
                    showFullscreenHint ? 'opacity-100' : 'opacity-0',
                  )}
                >
                  <span className="glass rounded-full px-3 py-1.5 text-xs font-medium text-fg">
                    Touchez l&apos;écran pour le plein écran
                  </span>
                </div>
              </PlayerSlot>
              {/* NB : les fleches de zapping en overlay (top-1/2 sur les bords)
                  ont ete retirees — elles captaient le tap "reveler les controles"
                  du lecteur natif (zapping involontaire). Le zapping reste dispo
                  via les boutons labellises Precedente/Suivante sous le lecteur. */}
            </div>
            {/* Masque en paysage : rien a faire defiler sous le plein ecran. */}
            <div className="space-y-4 phone-land:hidden">
              {failoverNotice !== null && (
                <p role="status" className="rounded-xl bg-ink-800 px-4 py-2.5 text-xs text-fg-muted">
                  {failoverNotice}
                </p>
              )}
              <NowPlaying credentials={credentials} streamId={streamId} />
              {versions.length > 1 && (
                <div>
                  <p className="mb-2 text-xs font-medium text-fg-muted">Autres versions</p>
                  <div className="flex flex-wrap gap-2">
                    {versions.map((version) => (
                      <Link
                        key={version.channel.id}
                        href={liveHref(version.channel.id)}
                        replace
                        className={cn(
                          'rounded-lg px-3.5 py-2.5 text-[13px] font-medium transition-colors',
                          version.channel.id === streamId
                            ? 'bg-accent text-white'
                            : 'bg-ink-800 text-fg-muted hover:text-fg',
                        )}
                      >
                        {version.label}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
              <p className="-mb-2 px-1 text-[11px] text-fg-faint">
                {zapLabel !== null ? `Zapping · ${zapLabel} · ` : ''}glisse la vidéo ← → pour changer
              </p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  disabled={neighbors.previous === null}
                  onClick={() => {
                    if (neighbors.previous !== null) zapTo(neighbors.previous.id);
                  }}
                  className="min-w-0 rounded-xl bg-ink-800 px-4 py-3 text-left text-xs text-fg-muted transition-colors hover:bg-ink-700 hover:text-fg disabled:opacity-35"
                >
                  <span className="block text-[10px] uppercase tracking-wider text-fg-faint">Précédente</span>
                  <span className="mt-1 block truncate">
                    {neighbors.previous != null ? nameOf(neighbors.previous) : 'Indisponible'}
                  </span>
                </button>
                <button
                  type="button"
                  disabled={neighbors.next === null}
                  onClick={() => {
                    if (neighbors.next !== null) zapTo(neighbors.next.id);
                  }}
                  className="min-w-0 rounded-xl bg-ink-800 px-4 py-3 text-right text-xs text-fg-muted transition-colors hover:bg-ink-700 hover:text-fg disabled:opacity-35"
                >
                  <span className="block text-[10px] uppercase tracking-wider text-fg-faint">Suivante</span>
                  <span className="mt-1 block truncate">
                    {neighbors.next != null ? nameOf(neighbors.next) : 'Indisponible'}
                  </span>
                </button>
              </div>
              {recall !== null && recallName !== null && (
                <button
                  type="button"
                  onClick={() => zapTo(recall.itemId)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-ink-800 px-4 py-3 text-xs text-fg-muted transition-colors hover:bg-ink-700 hover:text-fg"
                >
                  <span aria-hidden>↺</span>
                  <span className="truncate">
                    Chaîne précédente · <span className="text-fg">{recallName}</span>
                  </span>
                </button>
              )}
              {/* VLC : dernier recours, seulement si active dans les Reglages. */}
              {showVlcButton && vlcSrc !== null && (
                <ExternalPlayer
                  streamUrl={vlcSrc}
                  label={failed ? 'Ça ne marche pas ici ? Ouvrir dans VLC' : 'Regarder dans VLC'}
                />
              )}
            </div>
          </div>
        )
      )}
    </main>
  );
}
