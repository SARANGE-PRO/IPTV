/**
 * Geste « glisser pour reduire » facon YouTube (mobile, ecran de lecture).
 *
 * Au premier mouvement franc vers le bas, la video est SOULEVEE dans un calque
 * flottant (meme <video>, simplement deplacee : aucun rechargement). Ensuite,
 * a chaque image :
 *  - la video suit le doigt et retrecit pour viser EXACTEMENT la vignette du
 *    mini-lecteur ;
 *  - la page de lecture (`[data-zib-sheet]`) glisse et s'efface ;
 *  - le voile d'une fiche (`[data-zib-backdrop]`) s'eclaircit : la page du
 *    dessous apparait ;
 *  - le mini-lecteur se dessine autour de l'endroit ou la video va se poser.
 *
 * Relache : au-dela d'un seuil (distance ou vitesse), la video termine sa
 * course dans la vignette puis la page se ferme (`onMinimize`) ; sinon tout
 * revient en place. Uniquement transform / opacity, mis a jour via
 * requestAnimationFrame : fluide meme si la page travaille.
 *
 * Touch events (et non pointer events) : seul moyen sur iOS d'empecher le
 * defilement de la page des le premier mouvement vers le bas.
 *
 * Le geste ne s'engage que si la page (ou la fiche) est TOUT EN HAUT : plus
 * bas, glisser vers le bas sur la video fait simplement remonter la page.
 *
 * Swipe HORIZONTAL (optionnel, Live) : gauche = suivant, droite = precedent.
 * Actif aussi en paysage (plein ecran CSS) ; la video ne bouge pas, la page
 * affiche seulement le changement.
 */

import { dropSurface, getDockTarget, liftSurface, onLiftedSlotReleased } from '@/components/player/host/playerSurface';
import { isInPip } from '@/services/player/pictureInPicture';
import { PHONE_LANDSCAPE_QUERY } from '@/utils/videoFullscreen';

/** Deplacement (px) qui engage le geste. */
const DECIDE_PX = 8;
/** Bande basse de la video reservee aux commandes natives (barre de lecture). */
const CONTROLS_BAND_PX = 52;
/** Part de la course au-dela de laquelle on reduit au relachement. */
const COMMIT_PROGRESS = 0.28;
/** Vitesse (px/ms) d'un coup sec vers le bas qui reduit quelle que soit la distance. */
const COMMIT_VELOCITY = 0.45;
/** Vitesse vers le haut qui annule toujours. */
const CANCEL_VELOCITY = -0.3;
/** Fenetre (ms) de calcul de la vitesse au relachement. */
const VELOCITY_WINDOW_MS = 90;
/** Swipe horizontal : distance OU coup sec qui valide le changement. */
const SWIPE_PX = 64;
const SWIPE_VELOCITY = 0.5;
/** Tolerance de defilement (px) sous laquelle la page est consideree en haut. */
const AT_TOP_PX = 4;
/** Delai max entre la fermeture demandee et le demontage effectif de la page. */
const NAVIGATION_TIMEOUT_MS = 1500;
const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
const INTERACTIVE = 'button, a, input, select, textarea, [role="button"]';

interface Box {
  left: number;
  top: number;
  width: number;
}

export interface SwipeHandlers {
  onNext: (() => void) | null;
  onPrevious: (() => void) | null;
}

interface Swipe {
  touchId: number;
  startX: number;
  startY: number;
  startT: number;
  handlers: SwipeHandlers;
}

let swipe: Swipe | null = null;

interface Gesture {
  phase: 'pending' | 'dragging' | 'settling';
  touchId: number;
  wrapper: HTMLElement;
  target: HTMLElement;
  onMinimize: () => void;
  startX: number;
  startY: number;
  /** Ordonnee du doigt quand le geste s'engage (aucun saut de la video). */
  originY: number;
  offset: number;
  samples: Array<{ y: number; t: number }>;
  from: Box;
  to: Box;
  travel: number;
  sheet: HTMLElement | null;
  backdrop: HTMLElement | null;
  dock: HTMLElement | null;
  video: HTMLVideoElement | null;
  hadControls: boolean;
  frame: number | null;
  timer: ReturnType<typeof setTimeout> | null;
}

let gesture: Gesture | null = null;
let layer: HTMLElement | null = null;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function inLandscapeFullscreen(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(PHONE_LANDSCAPE_QUERY).matches;
}

/** La page (ou la fiche qui defile) est-elle tout en haut ? */
function scrolledToTop(wrapper: HTMLElement): boolean {
  const scroller = wrapper.closest<HTMLElement>('[data-zib-backdrop]') ?? document.scrollingElement;
  return scroller === null || scroller.scrollTop <= AT_TOP_PX;
}

function findTouch(list: TouchList, id: number): Touch | null {
  for (let i = 0; i < list.length; i += 1) {
    const touch = list.item(i);
    if (touch !== null && touch.identifier === id) return touch;
  }
  return null;
}

function progressOf(g: Gesture, offset: number): number {
  return clamp(offset / g.travel, 0, 1);
}

/** Applique l'etat visuel pour un decalage donne (une ecriture par element). */
function paint(g: Gesture, offset: number): void {
  if (layer === null) return;
  const p = progressOf(g, offset);
  const scale = lerp(1, g.to.width / g.from.width, p);
  const tx = lerp(0, g.to.left - g.from.left, p);
  layer.style.transform = `translate3d(${tx}px, ${offset}px, 0) scale(${scale})`;
  layer.style.borderRadius = `${lerp(16, 12 / scale, p)}px`;
  if (g.sheet !== null) {
    g.sheet.style.opacity = String(1 - clamp(p * 1.6, 0, 1));
    g.sheet.style.transform = `translate3d(0, ${offset * 0.45}px, 0)`;
  }
  if (g.backdrop !== null) g.backdrop.style.opacity = String(1 - p);
  if (g.dock !== null) g.dock.style.opacity = String(clamp((p - 0.5) / 0.5, 0, 1));
}

function setTransitions(g: Gesture, durationMs: number): void {
  const t = (props: string) =>
    durationMs > 0
      ? props
          .split(',')
          .map((prop) => `${prop.trim()} ${durationMs}ms ${EASE}`)
          .join(', ')
      : 'none';
  if (layer !== null) layer.style.transition = t('transform, border-radius');
  if (g.sheet !== null) g.sheet.style.transition = t('opacity, transform');
  if (g.backdrop !== null) g.backdrop.style.transition = t('opacity');
  if (g.dock !== null) g.dock.style.transition = t('opacity');
}

function schedulePaint(g: Gesture): void {
  if (g.frame !== null) return;
  g.frame = requestAnimationFrame(() => {
    g.frame = null;
    if (gesture === g && g.phase === 'dragging') paint(g, g.offset);
  });
}

/** Le geste s'engage : la video passe dans le calque flottant. */
function begin(g: Gesture, touchY: number): boolean {
  const dockTarget = getDockTarget();
  if (layer === null || dockTarget === null) return false;
  const video = g.target.querySelector('video');
  const frame = video?.parentElement ?? g.target;
  const from = frame.getBoundingClientRect();
  const to = dockTarget.getBoundingClientRect();
  if (from.width <= 0 || to.width <= 0) return false;

  g.phase = 'dragging';
  g.originY = touchY;
  g.from = { left: from.left, top: from.top, width: from.width };
  g.to = { left: to.left, top: to.top, width: to.width };
  g.travel = Math.max(80, to.top - from.top);
  g.video = video;
  g.hadControls = video?.controls ?? false;
  g.sheet = g.wrapper.closest<HTMLElement>('[data-zib-sheet]');
  g.backdrop = g.wrapper.closest<HTMLElement>('[data-zib-backdrop]');
  g.dock = dockTarget.closest<HTMLElement>('.zib-mini');

  // La page garde sa mise en page pendant que la video est ailleurs.
  g.target.style.height = `${g.target.getBoundingClientRect().height}px`;

  Object.assign(layer.style, {
    display: 'block',
    left: `${from.left}px`,
    top: `${from.top}px`,
    width: `${from.width}px`,
    height: `${from.height}px`,
    transform: 'none',
    transition: 'none',
  });
  liftSurface(layer);
  // Pas de commandes natives pendant le vol (elles ne suivraient pas l'echelle).
  if (video !== null) video.controls = false;

  for (const el of [g.sheet, g.backdrop]) {
    if (el === null) continue;
    // Animation d'entree (fill « both ») : elle l'emporterait sur nos styles.
    // Son etat final est l'etat normal, on peut donc la retirer sans rien changer.
    for (const animation of el.getAnimations()) animation.cancel();
    el.style.willChange = 'opacity, transform';
  }
  if (g.dock !== null) {
    Object.assign(g.dock.style, { visibility: 'visible', opacity: '0', pointerEvents: 'none' });
  }
  setTransitions(g, 0);
  return true;
}

/** Remet tout a l'etat normal (styles poses par le geste). */
function clearStyles(g: Gesture, fadeSheetIn: boolean): void {
  if (layer !== null) {
    Object.assign(layer.style, { display: 'none', transform: '', transition: '', borderRadius: '' });
  }
  g.target.style.height = '';
  if (g.sheet !== null) {
    const sheet = g.sheet;
    sheet.style.willChange = '';
    sheet.style.transform = '';
    if (fadeSheetIn) {
      // La page qui revient (ex. liste des chaines) apparait en douceur.
      sheet.style.transition = `opacity 220ms ${EASE}`;
      sheet.style.opacity = '';
      setTimeout(() => {
        sheet.style.transition = '';
      }, 260);
    } else {
      sheet.style.transition = '';
      sheet.style.opacity = '';
    }
  }
  if (g.backdrop !== null) {
    Object.assign(g.backdrop.style, { opacity: '', transition: '', willChange: '' });
  }
  if (g.dock !== null) {
    Object.assign(g.dock.style, { visibility: '', opacity: '', pointerEvents: '', transition: '' });
  }
}

/** La page s'est fermee : la video se pose dans le mini-lecteur. */
function land(g: Gesture): void {
  if (g.timer !== null) clearTimeout(g.timer);
  // Atterrissage instantane : pas d'animation d'entree du mini-lecteur.
  g.dock?.setAttribute('data-enter', 'instant');
  dropSurface();
  clearStyles(g, true);
  if (gesture === g) gesture = null;
}

/** Abandon : tout revient a sa place, la video retourne dans sa page. */
function restore(g: Gesture): void {
  if (g.timer !== null) clearTimeout(g.timer);
  onLiftedSlotReleased(null);
  if (g.video !== null) g.video.controls = g.hadControls;
  dropSurface();
  clearStyles(g, false);
  if (gesture === g) gesture = null;
}

function settle(g: Gesture, commit: boolean): void {
  g.phase = 'settling';
  if (g.frame !== null) {
    cancelAnimationFrame(g.frame);
    g.frame = null;
  }
  const p = progressOf(g, g.offset);
  const duration = Math.round(commit ? clamp((1 - p) * 340, 170, 340) : clamp(p * 340, 150, 300));
  setTransitions(g, duration);
  // Force le recalcul pour que la transition parte de l'etat courant.
  void layer?.offsetWidth;
  paint(g, commit ? g.travel : 0);

  g.timer = setTimeout(() => {
    g.timer = null;
    if (!commit) {
      restore(g);
      return;
    }
    // La video est sur la vignette : on ferme la page. Le demontage de son
    // emplacement declenche l'atterrissage (land).
    onLiftedSlotReleased(() => land(g));
    g.onMinimize();
    // Filet : navigation refusee (aucun historique…) -> on revient en place.
    g.timer = setTimeout(() => {
      g.timer = null;
      if (gesture !== g) return;
      settle(g, false);
    }, NAVIGATION_TIMEOUT_MS);
  }, duration + 20);
}

function onTouchMove(e: TouchEvent): void {
  const g = gesture;
  if (g === null || g.phase === 'settling') return;
  const touch = findTouch(e.touches, g.touchId);
  if (touch === null) return;
  const dx = touch.clientX - g.startX;
  const dy = touch.clientY - g.startY;

  if (g.phase === 'pending') {
    // Vers le haut ou de cote : la page defile normalement (le swipe
    // horizontal, s'il est branche, est suivi a part).
    if (dy < 0 || Math.abs(dx) > Math.max(dy, 3)) {
      gesture = null;
      return;
    }
    if (dy === 0) return;
    // Vers le bas : on bloque le defilement DES le 1er mouvement (iOS ne
    // permet plus de l'annuler une fois engage).
    if (e.cancelable) e.preventDefault();
    if (dy < DECIDE_PX) return;
    if (!begin(g, touch.clientY)) {
      gesture = null;
      return;
    }
  }

  if (e.cancelable) e.preventDefault();
  // Un peu de resistance au-dela de la vignette, aucune au-dessus du depart.
  const raw = touch.clientY - g.originY;
  g.offset = raw <= g.travel ? Math.max(0, raw) : g.travel + (raw - g.travel) * 0.25;
  g.samples.push({ y: touch.clientY, t: e.timeStamp });
  if (g.samples.length > 8) g.samples.shift();
  schedulePaint(g);
}

function onTouchEnd(e: TouchEvent): void {
  const g = gesture;
  if (g === null || g.phase === 'settling') return;
  if (findTouch(e.changedTouches, g.touchId) === null) return;
  if (g.phase === 'pending') {
    gesture = null;
    return;
  }
  const last = g.samples[g.samples.length - 1];
  const first = g.samples.find((s) => last !== undefined && last.t - s.t <= VELOCITY_WINDOW_MS);
  const velocity = last !== undefined && first !== undefined && last.t > first.t ? (last.y - first.y) / (last.t - first.t) : 0;
  const p = progressOf(g, g.offset);
  const commit = e.type === 'touchend' && velocity > CANCEL_VELOCITY && (p >= COMMIT_PROGRESS || (velocity >= COMMIT_VELOCITY && p > 0.04));
  settle(g, commit);
}

/**
 * Branche le geste sur l'emplacement d'une video (ecran de lecture).
 * `getOnMinimize` : action de la page pour se fermer (meme que son bouton
 * retour) ; null = geste desactive.
 */
export function bindSlotGestures(
  wrapper: HTMLElement,
  target: HTMLElement,
  getOnMinimize: () => (() => void) | null,
  getSwipe: () => SwipeHandlers | null = () => null,
): () => void {
  const onTouchStart = (e: TouchEvent) => {
    if (gesture !== null || e.touches.length !== 1) return;
    const touch = e.touches[0];
    if (touch === undefined) return;
    const el = e.target instanceof Element ? e.target : null;
    if (el?.closest(INTERACTIVE) != null) return;
    const video = target.querySelector('video');
    if (video === null || isInPip(video)) return;
    const box = video.getBoundingClientRect();
    if (touch.clientY > box.bottom - CONTROLS_BAND_PX) return;
    const handlers = getSwipe();
    swipe =
      handlers !== null && (handlers.onNext !== null || handlers.onPrevious !== null)
        ? { touchId: touch.identifier, startX: touch.clientX, startY: touch.clientY, startT: e.timeStamp, handlers }
        : null;
    const onMinimize = getOnMinimize();
    if (onMinimize === null || inLandscapeFullscreen() || !scrolledToTop(wrapper)) return;
    gesture = {
      phase: 'pending',
      touchId: touch.identifier,
      wrapper,
      target,
      onMinimize,
      startX: touch.clientX,
      startY: touch.clientY,
      originY: touch.clientY,
      offset: 0,
      samples: [{ y: touch.clientY, t: e.timeStamp }],
      from: { left: 0, top: 0, width: 0 },
      to: { left: 0, top: 0, width: 0 },
      travel: 1,
      sheet: null,
      backdrop: null,
      dock: null,
      video: null,
      hadControls: false,
      frame: null,
      timer: null,
    };
  };

  // Swipe horizontal : decide au relachement (aucun suivi visuel du doigt).
  const onSwipeEnd = (e: TouchEvent) => {
    const s = swipe;
    swipe = null;
    if (s === null || e.type !== 'touchend' || gesture?.phase === 'dragging') return;
    const touch = findTouch(e.changedTouches, s.touchId);
    if (touch === null) return;
    const dx = touch.clientX - s.startX;
    const dy = touch.clientY - s.startY;
    // Franchement horizontal, assez long ou assez vif.
    if (Math.abs(dx) < Math.abs(dy) * 1.5) return;
    const velocity = Math.abs(dx) / Math.max(1, e.timeStamp - s.startT);
    if (Math.abs(dx) < SWIPE_PX && velocity < SWIPE_VELOCITY) return;
    if (Math.abs(dx) < 24) return;
    (dx < 0 ? s.handlers.onNext : s.handlers.onPrevious)?.();
  };

  wrapper.addEventListener('touchstart', onTouchStart, { passive: true });
  wrapper.addEventListener('touchmove', onTouchMove, { passive: false });
  wrapper.addEventListener('touchend', onTouchEnd);
  wrapper.addEventListener('touchcancel', onTouchEnd);
  wrapper.addEventListener('touchend', onSwipeEnd);
  wrapper.addEventListener('touchcancel', onSwipeEnd);
  return () => {
    wrapper.removeEventListener('touchstart', onTouchStart);
    wrapper.removeEventListener('touchmove', onTouchMove);
    wrapper.removeEventListener('touchend', onTouchEnd);
    wrapper.removeEventListener('touchcancel', onTouchEnd);
    wrapper.removeEventListener('touchend', onSwipeEnd);
    wrapper.removeEventListener('touchcancel', onSwipeEnd);
    swipe = null;
    // Emplacement retire en plein glissement (hors atterrissage) : on annule.
    const g = gesture;
    if (g !== null && g.wrapper === wrapper && g.phase === 'dragging') restore(g);
    else if (g !== null && g.wrapper === wrapper && g.phase === 'pending') gesture = null;
  };
}

/**
 * Calque flottant (monte une fois par PlayerHost). Une fois la video deplacee
 * dedans, les evenements tactiles remontent par lui et non plus par la page :
 * il relaie donc le suivi du doigt.
 */
export function bindLiftLayer(el: HTMLElement): () => void {
  layer = el;
  el.addEventListener('touchmove', onTouchMove, { passive: false });
  el.addEventListener('touchend', onTouchEnd);
  el.addEventListener('touchcancel', onTouchEnd);
  return () => {
    el.removeEventListener('touchmove', onTouchMove);
    el.removeEventListener('touchend', onTouchEnd);
    el.removeEventListener('touchcancel', onTouchEnd);
    if (layer === el) layer = null;
  };
}
