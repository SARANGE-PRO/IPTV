'use client';

import Link from 'next/link';
import { memo, useState } from 'react';
import { ChannelLogo } from '@/components/shared/ChannelLogo';
import { IconMore } from '@/components/ui/actionIcons';
import { IconChevronDown, IconHeart } from '@/components/ui/icons';
import { useLongPress } from '@/hooks/useLongPress';
import { cn } from '@/lib/cn';
import { useFavoritesStore } from '@/stores/favoritesStore';
import { useFavoritesUiStore } from '@/stores/favoritesUiStore';
import { usePlayerStore } from '@/stores/playerStore';
import { liveHref } from '@/utils/appRoutes';

/**
 * Ligne de chaine Live (grille FR, favoris, international) : numero TNT,
 * logo, nom, qualite, versions depliables et menu « ⋯ » (favori, ranger dans
 * un onglet, masquer la categorie) — aussi a l'appui long sur la ligne. Le
 * coeur n'est plus qu'un indicateur : un seul bouton a droite, moins de
 * mauvais taps. Composant de presentation pur.
 */

export interface LiveRowVersion {
  id: string;
  label: string;
}

export interface LiveRowData {
  /** Flux lance au tap (meilleure version). */
  id: string;
  name: string;
  logoUrl: string | null;
  /** Logos de repli (autres versions de la chaine), essayes si `logoUrl` echoue. */
  logoAlternates?: string[];
  /** Chaine FR : autorise les logos de repli externes connus. */
  isFrench?: boolean;
  lcn?: number | null;
  /** Pastilles discretes (« HD », « BE »…). */
  badges?: string[];
  versions?: LiveRowVersion[];
  categoryId: string;
  categoryName?: string;
}

function LiveChannelRowImpl({ row, onPlay }: { row: LiveRowData; onPlay?: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const versions = row.versions ?? [];
  const versionIds = versions.length > 0 ? versions.map((v) => v.id) : [row.id];
  // Une chaine est favorite si l'une de ses versions l'est (4K ajoutee depuis le lecteur…).
  const favoriteId = useFavoritesStore((s) => versionIds.find((id) => s.ids.live.has(id)) ?? null);
  const playingId = usePlayerStore((s) =>
    s.session?.media.kind === 'live' && versionIds.includes(s.session.media.ownerId) ? s.session.media.ownerId : null,
  );
  const openSheet = useFavoritesUiStore((s) => s.openSheet);
  const targetId = favoriteId ?? row.id;
  const multi = versions.length > 1;
  const openOptions = () =>
    openSheet({
      type: 'live',
      itemId: targetId,
      title: row.name,
      hideCategory:
        row.categoryName !== undefined ? { categoryId: row.categoryId, categoryName: row.categoryName } : undefined,
    });
  const longPress = useLongPress(openOptions);

  return (
    <div className={cn('rounded-xl transition-colors hover:bg-ink-800', playingId !== null && 'bg-ink-800/70')}>
      <div className="flex items-center gap-1 py-1.5 pl-1.5 pr-1">
        <Link
          href={liveHref(row.id)}
          onClick={() => onPlay?.(row.id)}
          {...longPress}
          className="flex min-w-0 flex-1 select-none items-center gap-3 rounded-lg py-0.5"
        >
          {/* Colonne numero seulement dans la grille FR (lcn fourni, meme null). */}
          {row.lcn !== undefined && (
            <span className="w-6 shrink-0 text-right font-mono text-[11px] tabular-nums text-fg-faint">
              {row.lcn ?? ''}
            </span>
          )}
          <ChannelLogo
            channel={{ name: row.name, logoUrl: row.logoUrl, isFrench: row.isFrench === true ? 1 : 0 }}
            alternates={row.logoAlternates}
            className="h-11 w-11 shrink-0"
          />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <span className="truncate text-sm text-fg">{row.name}</span>
              {favoriteId !== null && (
                <span role="img" aria-label="Favori" className="shrink-0 text-accent">
                  <IconHeart className="h-3 w-3" filled />
                </span>
              )}
            </span>
            {(playingId !== null || (row.badges?.length ?? 0) > 0) && (
              <span className="mt-0.5 flex items-center gap-1.5">
                {playingId !== null && (
                  <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-accent">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
                    En cours
                  </span>
                )}
                {row.badges?.map((badge) => (
                  <span key={badge} className="rounded bg-ink-600/80 px-1 py-px text-[10px] font-semibold text-fg-muted">
                    {badge}
                  </span>
                ))}
              </span>
            )}
          </span>
        </Link>
        {multi && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-label={`${versions.length} versions`}
            className="relative hit-44 flex h-8 shrink-0 items-center gap-0.5 rounded-full bg-ink-700 px-2.5 text-[11px] font-medium text-fg-muted hover:text-fg"
          >
            {versions.length}
            <IconChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
          </button>
        )}
        <button
          type="button"
          aria-label={`Options de ${row.name}`}
          onClick={openOptions}
          className="ml-1 grid h-11 w-11 shrink-0 place-items-center rounded-full text-fg-faint hover:text-fg"
        >
          <IconMore className="h-5 w-5" />
        </button>
      </div>
      {open && multi && (
        <div className="flex flex-wrap gap-2 pb-3 pl-[4.75rem] pr-3">
          {versions.map((version) => (
            <Link
              key={version.id}
              href={liveHref(version.id)}
              onClick={() => onPlay?.(version.id)}
              className={cn(
                'rounded-lg px-3.5 py-2.5 text-[13px] font-medium transition-colors',
                version.id === playingId
                  ? 'bg-accent text-white'
                  : 'bg-ink-700 text-fg-muted hover:bg-ink-600 hover:text-fg',
              )}
            >
              {version.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export const LiveChannelRow = memo(LiveChannelRowImpl);
