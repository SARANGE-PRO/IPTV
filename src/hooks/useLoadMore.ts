import { useEffect, useRef } from 'react';

/**
 * Sentinelle d'infinite scroll : rend une ref a poser sur un div en bas de
 * liste ; onMore est appele quand elle approche du viewport.
 */
export function useLoadMore(onMore: () => void, enabled: boolean) {
  const ref = useRef<HTMLDivElement | null>(null);
  const onMoreRef = useRef(onMore);
  onMoreRef.current = onMore;

  useEffect(() => {
    const el = ref.current;
    if (!enabled || el === null) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) onMoreRef.current();
      },
      { rootMargin: '600px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [enabled]);

  return ref;
}
