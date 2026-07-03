'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { EmptyState } from '@/components/shared/EmptyState';
import { FavoriteButton } from '@/components/shared/FavoriteButton';
import { ExternalPlayer } from '@/components/player/ExternalPlayer';
import { VideoPlayer } from '@/components/player/VideoPlayer';
import { IconArrowLeft } from '@/components/ui/icons';
import * as catalogRepository from '@/db/repositories/catalogRepository';
import { buildLiveStreamUrl } from '@/services/xtream/xtreamUrls';
import { useAuthStore } from '@/stores/authStore';
import { usePlaybackStore } from '@/stores/playbackStore';
import { useUiSettingsStore } from '@/stores/uiSettingsStore';
import type { LiveChannel } from '@/types/models';

export default function LiveWatchPage() {
  const { streamId } = useParams<{ streamId: string }>();
  const credentials = useAuthStore((s) => s.credentials);
  const recordLiveWatch = usePlaybackStore((s) => s.recordLiveWatch);
  const showVlcButton = useUiSettingsStore((s) => s.showVlcButton);
  const router = useRouter();
  const [channel, setChannel] = useState<LiveChannel | null | undefined>(undefined);

  useEffect(() => {
    let active = true;
    void catalogRepository.getLiveChannelById(streamId).then((c) => {
      if (active) setChannel(c ?? null);
    });
    return () => {
      active = false;
    };
  }, [streamId]);

  useEffect(() => {
    if (channel !== null && channel !== undefined) {
      recordLiveWatch(channel.id, channel.name, channel.logoUrl);
    }
  }, [channel, recordLiveWatch]);

  const src = credentials !== null ? buildLiveStreamUrl(credentials, streamId) : null;

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
          {channel?.name ?? 'Chaîne'}
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
            <VideoPlayer src={src} live />
            {showVlcButton && <ExternalPlayer streamUrl={src} label="Regarder dans VLC" />}
          </div>
        )
      )}
    </main>
  );
}
