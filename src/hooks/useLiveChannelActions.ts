import { useLongPress } from '@/hooks/useLongPress';
import { useFavoritesStore } from '@/stores/favoritesStore';
import { useFavoritesUiStore } from '@/stores/favoritesUiStore';
import { usePlayerStore } from '@/stores/playerStore';

/**
 * Etat et actions d'une chaine Live, communs a la ligne (liste) et a la carte
 * (vitrine) : favorite si l'une de ses versions l'est, version en lecture,
 * options (favori, ranger, masquer la categorie) au « ⋯ » ou a l'appui long.
 */
export function useLiveChannelActions(channel: {
  id: string;
  name: string;
  versionIds: readonly string[];
  categoryId: string;
  categoryName?: string;
}) {
  const ids = channel.versionIds.length > 0 ? channel.versionIds : [channel.id];
  const favoriteId = useFavoritesStore((s) => ids.find((id) => s.ids.live.has(id)) ?? null);
  const playingId = usePlayerStore((s) =>
    s.session?.media.kind === 'live' && ids.includes(s.session.media.ownerId) ? s.session.media.ownerId : null,
  );
  const openSheet = useFavoritesUiStore((s) => s.openSheet);
  const openOptions = () =>
    openSheet({
      type: 'live',
      itemId: favoriteId ?? channel.id,
      title: channel.name,
      hideCategory:
        channel.categoryName !== undefined
          ? { categoryId: channel.categoryId, categoryName: channel.categoryName }
          : undefined,
    });
  const longPress = useLongPress(openOptions);
  return { favoriteId, playingId, openOptions, longPress };
}
