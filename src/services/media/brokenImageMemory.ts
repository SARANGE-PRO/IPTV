/**
 * Memoire (session) des URLs d'images cassees — evite de retenter en boucle un
 * logo/poster mort au scroll. Purement en RAM, aucun reseau, aucune persistance.
 */

const broken = new Set<string>();

export function markImageBroken(url: string): void {
  if (url !== '') broken.add(url);
}

export function isImageBroken(url: string | null | undefined): boolean {
  return url !== null && url !== undefined && broken.has(url);
}
