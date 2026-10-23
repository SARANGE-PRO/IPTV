'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { IconFolder, IconPlus } from '@/components/ui/actionIcons';
import { IconCheck, IconEyeOff, IconHeart } from '@/components/ui/icons';
import { cn } from '@/lib/cn';
import { itemKey, TAB_NAME_MAX } from '@/services/favorites/favoriteTabsService';
import { useFavoritesStore } from '@/stores/favoritesStore';
import { useFavoritesUiStore } from '@/stores/favoritesUiStore';
import { useFilterStore } from '@/stores/filterStore';

const EMPTY: ReadonlySet<string> = new Set();

/**
 * Feuille « Ranger dans un onglet » (montee une fois dans le layout) : favori
 * oui/non, onglets coches, creation d'onglet a la volee et, pour une chaine,
 * masquage de sa categorie. Chaque geste est enregistre immediatement.
 */
export function FavoriteTabsSheet() {
  const target = useFavoritesUiStore((s) => s.sheet);
  const close = useFavoritesUiStore((s) => s.closeSheet);
  const showToast = useFavoritesUiStore((s) => s.showToast);
  const tabs = useFavoritesStore((s) => s.tabs);
  const key = target !== null ? itemKey(target.type, target.itemId) : '';
  const memberOf = useFavoritesStore((s) => s.membership.get(key) ?? EMPTY);
  const isFavorite = useFavoritesStore((s) => (target !== null ? s.ids[target.type].has(target.itemId) : false));
  const toggle = useFavoritesStore((s) => s.toggle);
  const setItemTabs = useFavoritesStore((s) => s.setItemTabs);
  const createTab = useFavoritesStore((s) => s.createTab);
  const hideCategory = useFilterStore((s) => s.hideCategory);
  const [draft, setDraft] = useState('');
  const [creating, setCreating] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setDraft('');
    setCreating(false);
    if (target === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [target, close]);

  useEffect(() => {
    if (creating) inputRef.current?.focus();
  }, [creating]);

  if (target === null) return null;

  const toggleTab = (tabId: string) => {
    const next = new Set(memberOf);
    if (next.has(tabId)) next.delete(tabId);
    else next.add(tabId);
    void setItemTabs(target.type, target.itemId, [...next]);
  };

  const submitNewTab = async () => {
    const name = draft.trim();
    if (name === '') {
      setCreating(false);
      return;
    }
    const tab = await createTab(name);
    await setItemTabs(target.type, target.itemId, [...memberOf, tab.id]);
    setDraft('');
    setCreating(false);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Ranger dans un onglet"
      onClick={close}
      className="fixed inset-0 z-[80] flex animate-fade-in items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-6"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85dvh] w-full max-w-md animate-modal-rise overflow-y-auto overscroll-contain rounded-t-3xl border-t border-ink-700/70 bg-ink-900 pb-[calc(env(safe-area-inset-bottom)+1rem)] shadow-2xl shadow-black/60 sm:rounded-3xl sm:border sm:pb-4"
      >
        <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-ink-600 sm:hidden" />
        <div className="px-5 pb-2 pt-4">
          <p className="text-[11px] font-medium uppercase tracking-wider text-fg-faint">Ranger dans un onglet</p>
          {target.title !== '' && <h2 className="mt-0.5 truncate text-base font-semibold text-fg">{target.title}</h2>}
        </div>

        <div className="px-3">
          <SheetRow
            onClick={() => void toggle(target.type, target.itemId)}
            icon={<IconHeart className="h-5 w-5" filled={isFavorite} />}
            iconClassName={isFavorite ? 'text-accent' : 'text-fg-muted'}
            label="Mes favoris"
            checked={isFavorite}
          />
        </div>

        <p className="mt-3 px-5 pb-1 text-xs font-medium text-fg-faint">
          {tabs.length === 0 ? 'Crée un onglet pour ranger tes favoris (Sport, Info, Ciné…)' : 'Onglets'}
        </p>
        <div className="px-3">
          {tabs.map((tab) => (
            <SheetRow
              key={tab.id}
              onClick={() => toggleTab(tab.id)}
              icon={<IconFolder className="h-5 w-5" />}
              label={tab.name}
              checked={memberOf.has(tab.id)}
            />
          ))}
          {creating ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void submitNewTab();
              }}
              className="flex items-center gap-2 px-2 py-1.5"
            >
              <input
                ref={inputRef}
                value={draft}
                maxLength={TAB_NAME_MAX}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => {
                  if (draft.trim() === '') setCreating(false);
                }}
                placeholder="Nom de l'onglet"
                enterKeyHint="done"
                className="h-11 min-w-0 flex-1 rounded-xl border border-ink-600 bg-ink-800 px-3 text-base text-fg placeholder:text-fg-faint focus:border-accent/60 focus:outline-none"
              />
              <button
                type="submit"
                className="h-11 shrink-0 rounded-xl bg-accent px-4 text-sm font-semibold text-white disabled:opacity-40"
                disabled={draft.trim() === ''}
              >
                Créer
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left text-sm font-medium text-accent hover:bg-ink-800"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10">
                <IconPlus className="h-5 w-5" />
              </span>
              Nouvel onglet
            </button>
          )}
        </div>

        {target.hideCategory !== undefined && (
          <div className="mt-2 border-t border-ink-700/60 px-3 pt-2">
            <button
              type="button"
              onClick={() => {
                const hide = target.hideCategory!;
                void hideCategory('live', hide.categoryId, hide.categoryName);
                showToast({ kind: 'info', message: `« ${hide.categoryName} » masquée — réactivable dans les Réglages` });
                close();
              }}
              className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-ink-800"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ink-800 text-fg-muted">
                <IconEyeOff className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-fg">Masquer la catégorie</span>
                <span className="block truncate text-xs text-fg-faint">{target.hideCategory.categoryName}</span>
              </span>
            </button>
          </div>
        )}

        <div className="px-5 pt-3">
          <button
            type="button"
            onClick={close}
            className="h-11 w-full rounded-xl bg-ink-700 text-sm font-semibold text-fg hover:bg-ink-600"
          >
            Terminé
          </button>
        </div>
      </div>
    </div>
  );
}

function SheetRow({
  onClick,
  icon,
  iconClassName,
  label,
  checked,
}: {
  onClick: () => void;
  icon: ReactNode;
  iconClassName?: string;
  label: string;
  checked: boolean;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-ink-800"
    >
      <span
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ink-800',
          iconClassName ?? 'text-fg-muted',
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm text-fg">{label}</span>
      <span
        className={cn(
          'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors',
          checked ? 'border-accent bg-accent text-white' : 'border-ink-500 text-transparent',
        )}
      >
        <IconCheck className="h-3.5 w-3.5" />
      </span>
    </button>
  );
}
