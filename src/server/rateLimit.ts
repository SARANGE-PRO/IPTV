/**
 * Rate-limit BEST-EFFORT par cle (fenetre glissante, en memoire). Limite : l'etat
 * est par INSTANCE serverless (Vercel en spawn plusieurs, remise a zero au cold
 * start) -> ce n'est pas un quota distribue, juste un garde-fou contre l'abus
 * grossier d'un endpoint public.
 */
export function createRateLimiter(opts: { windowMs: number; max: number }): (key: string) => boolean {
  const hits = new Map<string, number[]>();
  return (key) => {
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter((t) => now - t < opts.windowMs);
    recent.push(now);
    hits.set(key, recent);
    // Borne la Map (evite une croissance non bornee sur une instance longue-duree).
    if (hits.size > 5000) {
      for (const [k, times] of hits) {
        if (times.every((t) => now - t >= opts.windowMs)) hits.delete(k);
      }
    }
    return recent.length > opts.max;
  };
}

/** IP cliente (Vercel reecrit x-forwarded-for ; en Docker, falsifiable). */
export function clientIp(request: Request): string {
  const fwd = request.headers.get('x-forwarded-for') ?? '';
  return fwd.split(',')[0]?.trim() || 'unknown';
}
