import type { MediaExtension } from '@/types/playbackCapabilities';

/**
 * Capacites de lecture d'un flux : extension, seekability. Detection PASSIVE
 * (lecture des proprietes du <video>), jamais de seek-test agressif ni de
 * requete reseau. Le Live n'utilise jamais cette logique de reprise VOD.
 */

export function detectExtension(src: string): MediaExtension {
  const path = src.split(/[?#]/)[0] ?? '';
  const ext = path.match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase();
  if (ext === 'mp4' || ext === 'm3u8' || ext === 'mkv' || ext === 'ts' || ext === 'avi') return ext;
  return 'other';
}

/**
 * Le flux accepte-t-il reellement le seek ? On exige une plage seekable non
 * vide et non ponctuelle. Sur un flux "live-like" (VOD servi en direct) la
 * plage est vide ou nulle -> reprise precise impossible.
 */
export function isSeekable(video: HTMLVideoElement): boolean {
  try {
    if (video.seekable.length === 0) return false;
    const start = video.seekable.start(0);
    const end = video.seekable.end(video.seekable.length - 1);
    return Number.isFinite(start) && Number.isFinite(end) && end - start > 1;
  } catch {
    return false;
  }
}
