import { useEffect, type RefObject } from 'react';
import { exitPip, isInPip } from '@/services/player/pictureInPicture';

/**
 * Image dans l'image de la <video> du lecteur unique :
 *  - fin du lecteur (demontage) : pas de fenetre PiP orpheline pointant sur
 *    une <video> detruite (au zapping, le PiP suit le nouveau flux) ;
 *  - PiP coupe dans les Reglages : bouton natif masque (disablePictureInPicture,
 *    Chrome/Edge) et, la ou l'attribut est ignore (Safari iPhone), toute entree
 *    en PiP est aussitot annulee — la video reste dans ZiBTV.
 */
export function usePipPolicy(videoRef: RefObject<HTMLVideoElement | null>, pipEnabled: boolean): void {
  useEffect(() => {
    const video = videoRef.current;
    return () => {
      if (video !== null) exitPip(video);
    };
  }, [videoRef]);

  useEffect(() => {
    const video = videoRef.current;
    if (video === null || pipEnabled) return;
    if (isInPip(video)) exitPip(video);
    const refusePip = () => {
      if (isInPip(video)) exitPip(video);
    };
    video.addEventListener('webkitpresentationmodechanged', refusePip);
    video.addEventListener('enterpictureinpicture', refusePip);
    return () => {
      video.removeEventListener('webkitpresentationmodechanged', refusePip);
      video.removeEventListener('enterpictureinpicture', refusePip);
    };
  }, [videoRef, pipEnabled]);
}
