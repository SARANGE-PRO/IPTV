/**
 * Bandes-annonces YouTube (brique PURE). Les panels Xtream exposent
 * `youtube_trailer` sous forme d'id nu OU d'URL complete ; TMDB donne l'id.
 * Lecture via youtube-nocookie (aucun cookie de suivi avant interaction).
 */

const ID = /^[\w-]{11}$/;
const IN_URL = /(?:v=|youtu\.be\/|embed\/|shorts\/)([\w-]{11})/;

/** Id YouTube (11 caracteres) depuis un id ou une URL, sinon null. */
export function youtubeId(raw: string | null | undefined): string | null {
  const value = (raw ?? '').trim();
  if (value === '') return null;
  if (ID.test(value)) return value;
  return IN_URL.exec(value)?.[1] ?? null;
}

export function youtubeEmbedUrl(id: string): string {
  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0&playsinline=1&modestbranding=1`;
}
