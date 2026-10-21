/**
 * Intro ZiBTV — decision de lecture AVANT le premier rendu.
 *
 * Le script ci-dessous est injecte en ligne dans <head> (layout racine) : il
 * s'execute pendant le parsing HTML, avant toute peinture et avant React. Il
 * pose `data-zib-intro="play"` sur <html> si l'intro doit jouer ; le CSS ne
 * montre l'overlay QUE sous cet attribut. Consequences :
 *  - aucun flash de l'app avant l'intro (l'ancienne version attendait
 *    l'hydratation pour s'afficher) ;
 *  - sans JS, ou si le script echoue, l'overlay reste masque (jamais bloquant) ;
 *  - l'animation demarre des la 1re frame, independamment de l'hydratation.
 *
 * Chaine statique, aucune donnee dynamique : pas de surface XSS.
 */

/** Attribut pose sur <html> pendant la lecture. */
export const ZIB_INTRO_ATTR = 'data-zib-intro';
/** Une seule lecture par session (= par lancement de la PWA sur iOS). */
export const ZIB_INTRO_STORAGE_KEY = 'zibSplashSeen';
/** Nom de l'animation finale (fondu de l'overlay) — cf. zibIntro.css. */
export const ZIB_INTRO_END_ANIMATION = 'zibIntroOut';
/** Duree totale de la choregraphie (2.9 s + 0.6 s de fondu). */
export const ZIB_INTRO_TOTAL_MS = 3500;

/**
 * Ne joue pas si : onglet ouvert en arriere-plan / prerendu (l'animation
 * se deroulerait sans spectateur), mouvement reduit demande, deja vue dans
 * la session. sessionStorage indisponible (navigation privee ancienne) :
 * on joue quand meme, une fois par chargement.
 */
export const ZIB_INTRO_BOOT_SCRIPT = `(function(){try{var d=document;if(d.visibilityState==='hidden'||d.prerendering)return;if(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;try{var s=window.sessionStorage;if(s.getItem('${ZIB_INTRO_STORAGE_KEY}')==='1')return;s.setItem('${ZIB_INTRO_STORAGE_KEY}','1')}catch(e){}d.documentElement.setAttribute('${ZIB_INTRO_ATTR}','play')}catch(e){}})();`;
