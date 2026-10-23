'use client';

import { ChannelLogo } from '@/components/shared/ChannelLogo';
import { PosterImage } from '@/components/shared/PosterImage';
import { SortableList } from '@/components/shared/SortableList';
import { IconGrip } from '@/components/ui/actionIcons';
import { IconX } from '@/components/ui/icons';
import { cn } from '@/lib/cn';

/** Element en mode edition (poignee, miniature, titre, retrait). */
export interface EditableItem {
  key: string;
  title: string;
  subtitle?: string | null;
  image: { kind: 'logo'; logoUrl: string | null } | { kind: 'poster'; posterUrl: string | null };
}

/** Liste reordonnable d'un type (chaines / films / series) + retrait. */
export function FavoriteEditList({
  label,
  items,
  removeLabel,
  onReorder,
  onRemove,
}: {
  label: string;
  items: EditableItem[];
  removeLabel: string;
  onReorder: (keys: string[]) => void;
  onRemove: (key: string) => void;
}) {
  if (items.length === 0) return null;
  const byKey = new Map(items.map((i) => [i.key, i] as const));
  return (
    <section className="mt-6">
      <h2 className="mb-2 px-1 text-sm font-semibold text-fg">
        {label} <span className="font-normal text-fg-faint">· {items.length}</span>
      </h2>
      <SortableList
        keys={items.map((i) => i.key)}
        onReorder={onReorder}
        className="flex flex-col"
        renderItem={(key, handle, dragging) => {
          const item = byKey.get(key)!;
          return (
            <div className={cn('flex items-center gap-2 rounded-xl py-1.5 pr-1', !dragging && 'hover:bg-ink-800/60')}>
              <button
                type="button"
                {...handle}
                className="grid h-11 w-10 shrink-0 cursor-grab place-items-center text-fg-faint active:cursor-grabbing"
              >
                <IconGrip className="h-5 w-5" />
              </button>
              {item.image.kind === 'logo' ? (
                <ChannelLogo channel={{ name: item.title, logoUrl: item.image.logoUrl }} className="h-10 w-10 shrink-0" />
              ) : (
                <PosterImage
                  src={item.image.posterUrl}
                  alt=""
                  className="h-14 w-10 shrink-0 overflow-hidden rounded-md bg-ink-800 object-cover"
                />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-fg">{item.title}</span>
                {item.subtitle != null && <span className="block truncate text-xs text-fg-faint">{item.subtitle}</span>}
              </span>
              <button
                type="button"
                onClick={() => onRemove(key)}
                aria-label={`${removeLabel} : ${item.title}`}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-fg-faint hover:bg-accent/15 hover:text-accent"
              >
                <IconX className="h-4 w-4" />
              </button>
            </div>
          );
        }}
      />
    </section>
  );
}
