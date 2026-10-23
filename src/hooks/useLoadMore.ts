import { useEffect, useRef } from 'react';

/**
 * Sentinelle d'infinite scroll : rend une ref a poser sur un div en bas de
 * liste ; onMore est appele quand elle approche du viewport. `resetKey` :
 * change a chaque page affichee -> la sentinelle est reobservee (sinon une
 * liste encore trop courte pour la faire sortir du viewport restait bloquee).
 */
export function useLoadMore(onMore: () => void, enabled: boolean, resetKey?: unknown) {
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
  }, [enabled, resetKey]);

  return ref;
}
