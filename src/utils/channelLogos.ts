/**
 * Logos candidats d'une chaine a plusieurs versions (HD/FHD/4K…) — module PUR.
 * Le plus partage d'abord (a egalite, l'ordre recu = meilleure version) : un
 * logo isole est plus souvent mort ou generique.
 */
export function rankVersionLogos(versions: readonly { logoUrl: string | null }[]): string[] {
  const counts = new Map<string, number>();
  for (const v of versions) {
    const url = v.logoUrl?.trim();
    if (url) counts.set(url, (counts.get(url) ?? 0) + 1);
  }
  // Map garde l'ordre d'insertion ; tri stable.
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([url]) => url);
}
