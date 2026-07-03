'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { CategoryPanel } from '@/components/shared/CategoryPanel';
import { CountrySelect } from '@/components/shared/CountrySelect';
import { EmptyState } from '@/components/shared/EmptyState';
import { FavoriteButton } from '@/components/shared/FavoriteButton';
import { PosterImage } from '@/components/shared/PosterImage';
import { IconChevronDown } from '@/components/ui/icons';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import * as catalogRepository from '@/db/repositories/catalogRepository';
import { useDebounce } from '@/hooks/useDebounce';
import { useLoadMore } from '@/hooks/useLoadMore';
import { useCatalogStore } from '@/stores/catalogStore';
import { useFilterStore } from '@/stores/filterStore';
import type { LiveChannel } from '@/types/models';
import { prioritizeCategories } from '@/utils/categoryPriority';
import { formatCount } from '@/utils/format';

const WINDOW = 150;
const SEARCH_LIMIT = 100;

function ChannelRow({ channel }: { channel: LiveChannel }) {
  return (
    <Link
      href={`/live/${channel.id}`}
      className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-ink-800"
    >
      <PosterImage src={channel.logoUrl} alt={channel.name} className="h-10 w-10 shrink-0 rounded-lg" />
      <span className="min-w-0 flex-1 truncate text-sm text-fg">{channel.name}</span>
      {channel.isFrench === 1 && (
        <span className="rounded bg-accent/15 px-1 py-0.5 text-[10px] font-semibold text-accent">FR</span>
      )}
      <FavoriteButton type="live" itemId={channel.id} />
    </Link>
  );
}

export default function LivePage() {
  const slice = useCatalogStore((s) => s.sections.live);
  const country = useFilterStore((s) => s.country);
  const setCountry = useFilterStore((s) => s.setCountry);
  const hidden = useFilterStore((s) => s.hidden.live);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [channels, setChannels] = useState<LiveChannel[]>([]);
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [visible, setVisible] = useState(WINDOW);
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query.trim(), 300);
  const [results, setResults] = useState<LiveChannel[] | null>(null);
  const [searching, setSearching] = useState(false);

  const categories = useMemo(
    () => prioritizeCategories(slice.categories, country, hidden),
    [slice.categories, country, hidden],
  );
  const countries = useMemo(
    () => slice.categories.map((c) => c.country).filter((c): c is string => c !== null),
    [slice.categories],
  );
  const selected = useMemo(
    () => categories.find((c) => c.id === selectedId) ?? null,
    [categories, selectedId],
  );

  useEffect(() => {
    const first = categories[0];
    if (first === undefined) return;
    if (selectedId === null || !categories.some((c) => c.id === selectedId)) {
      setSelectedId(first.id);
    }
  }, [categories, selectedId]);

  useEffect(() => {
    if (selectedId === null) return;
    let active = true;
    setLoadingChannels(true);
    setVisible(WINDOW);
    void catalogRepository.getLiveChannelsByCategory(selectedId).then((list) => {
      if (active) {
        setChannels(list);
        setLoadingChannels(false);
      }
    });
    return () => {
      active = false;
    };
  }, [selectedId]);

  useEffect(() => {
    if (debouncedQuery.length < 2) {
      setResults(null);
      setSearching(false);
      return;
    }
    let active = true;
    setSearching(true);
    void catalogRepository.searchLiveChannels(debouncedQuery, SEARCH_LIMIT).then((r) => {
      if (active) {
        setResults(r);
        setSearching(false);
      }
    });
    return () => {
      active = false;
    };
  }, [debouncedQuery]);

  const shown = results ?? channels.slice(0, visible);
  const sentinelRef = useLoadMore(
    () => setVisible((v) => v + WINDOW),
    results === null && visible < channels.length,
  );
  const catalogEmpty = slice.categories.length === 0 && slice.status !== 'loading';

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-6 md:px-8">
      <h1 className="text-2xl font-semibold tracking-tight text-fg">Live TV</h1>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex-1">
          <Input
            placeholder="Rechercher une chaîne…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            inputMode="search"
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPanelOpen(true)}
            className="flex h-10 max-w-56 items-center gap-2 rounded-xl border border-ink-600 bg-ink-800 px-3 text-sm text-fg"
          >
            <span className="truncate">{selected?.name ?? 'Catégories'}</span>
            <IconChevronDown className="h-4 w-4 shrink-0 text-fg-faint" />
          </button>
          <CountrySelect value={country} countries={countries} onChange={setCountry} />
        </div>
      </div>

      {results === null && channels.length > 0 && (
        <p className="mt-3 text-xs text-fg-faint">{formatCount(channels.length)} chaînes</p>
      )}
      {results !== null && (
        <p className="mt-3 text-xs text-fg-faint">
          {results.length >= SEARCH_LIMIT
            ? `${SEARCH_LIMIT}+ résultats — affine ta recherche`
            : `${results.length} résultat${results.length > 1 ? 's' : ''}`}
        </p>
      )}

      {catalogEmpty ? (
        <div className="mt-6">
          <EmptyState
            title="Catalogue non synchronisé"
            hint="Lance une synchronisation depuis les réglages pour charger les chaînes."
          />
        </div>
      ) : (
        <div className="mt-4 flex flex-col">
          {(loadingChannels || searching) && shown.length === 0
            ? Array.from({ length: 10 }, (_, i) => <Skeleton key={i} className="mb-2 h-14 rounded-xl" />)
            : shown.map((c) => <ChannelRow key={c.id} channel={c} />)}

          {results !== null && results.length === 0 && !searching && (
            <div className="mt-4">
              <EmptyState title="Aucune chaîne trouvée" />
            </div>
          )}
          {results === null && !loadingChannels && channels.length === 0 && selected !== null && (
            <div className="mt-4">
              <EmptyState title="Catégorie vide" />
            </div>
          )}
          {results === null && <div ref={sentinelRef} className="h-10" />}
        </div>
      )}

      <CategoryPanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        categories={categories}
        selectedId={selectedId}
        onSelect={setSelectedId}
        section="live"
      />
    </main>
  );
}
