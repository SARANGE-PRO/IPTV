/**
 * Surface du lecteur unique : un <div> HORS de l'arbre React (portail de
 * PlayerHost) que l'on DEPLACE dans le DOM entre l'emplacement de la page
 * (PlayerSlot) et le mini-lecteur. Deplacer un noeud ne recree pas la <video> :
 * aucune coupure d'image ni de son (WebKit/Blink ne mettent en pause qu'un
 * media resté DETACHE du document, pas un media deplace).
 *
 * Regles de placement :
 *  - l'emplacement le plus recent dont la cle est la session en cours gagne ;
 *  - une fiche ouverte (modal) masque les emplacements de la page dessous :
 *    seul un emplacement DANS le modal reste eligible ;
 *  - sinon : mini-lecteur ;
 *  - pendant le geste « glisser pour reduire », la video est SOULEVEE dans un
 *    calque flottant (playerGesture) et y reste jusqu'au relachement ;
 *  - pendant l'IMAGE DANS L'IMAGE, la video ne bouge plus (un deplacement
 *    fermerait le PiP) : la place est recalculee a la sortie du PiP. Seule
 *    exception : son emplacement disparait (page fermee) — elle part alors
 *    dans le mini-lecteur pour ne jamais etre detachee du document.
 *
 * Mini-lecteur -> emplacement : la video « vole » de la vignette jusqu'a sa
 * place (animation FLIP, compositeur uniquement).
 */

export type SlotLayout = 'default' | 'live';
export type SurfaceMode = 'inline' | 'mini';

export interface SurfaceSnapshot {
  mode: SurfaceMode;
  layout: SlotLayout;
}

interface Slot {
  el: HTMLElement;
  key: string | null;
  layout: SlotLayout;
}

export interface SlotHandle {
  /** Cet emplacement devient celui de la session `key` (lecture lancee ici). */
  claim: (key: string) => void;
  release: () => void;
}

const FLIP_DURATION_MS = 380;
const FLIP_EASING = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

let surface: HTMLDivElement | null = null;
let dock: HTMLElement | null = null;
let activeKey: string | null = null;
/** Cle de la session au moment ou elle est entree dans le mini-lecteur. */
let dockKey: string | null = null;
/** Calque flottant du geste : tant qu'il est defini, la video y reste. */
let lifted: HTMLElement | null = null;
/** Appele quand l'emplacement d'une video soulevee disparait (page fermee). */
let liftedReleaseHook: (() => void) | null = null;
let covers = 0;
/** Image dans l'image ouverte : placement fige. */
let frozen = false;
const slots: Slot[] = [];
let snapshot: SurfaceSnapshot = { mode: 'mini', layout: 'default' };
const listeners = new Set<() => void>();

/** Le <div> deplacable (cree une fois, client uniquement). */
export function getSurface(): HTMLDivElement {
  if (surface === null) {
    surface = document.createElement('div');
    // Aucune boite propre : le lecteur se met en page comme un enfant direct
    // de sa cible (emplacement ou mini-lecteur).
    surface.style.display = 'contents';
  }
  return surface;
}

function eligible(slot: Slot): boolean {
  if (slot.key === null || slot.key !== activeKey) return false;
  return covers === 0 || slot.el.closest('[aria-modal="true"]') !== null;
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** La video arrive du mini-lecteur : elle part de `from` et rejoint sa place. */
function flyIn(el: HTMLElement, from: DOMRect): void {
  if (prefersReducedMotion() || typeof el.animate !== 'function') return;
  const to = el.getBoundingClientRect();
  if (to.width <= 0 || from.width <= 0) return;
  const scale = from.width / to.width;
  el.animate(
    [
      { transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${scale})`, transformOrigin: '0 0' },
      { transform: 'none', transformOrigin: '0 0' },
    ],
    { duration: FLIP_DURATION_MS, easing: FLIP_EASING },
  );
}

function place(): void {
  let slot: Slot | null = null;
  for (let i = slots.length - 1; i >= 0; i -= 1) {
    const candidate = slots[i];
    if (candidate !== undefined && eligible(candidate)) {
      slot = candidate;
      break;
    }
  }
  const node = getSurface();
  if (frozen && node.isConnected) {
    // PiP : on ne touche pas au DOM ; l'etat (mode) reste a jour.
  } else if (lifted !== null) {
    if (node.parentNode !== lifted) lifted.appendChild(node);
  } else {
    const target = slot?.el ?? dock;
    // Retour en grand de la MEME lecture : on part de la vignette.
    const flyFrom =
      slot !== null && dock !== null && node.parentNode === dock && slot.key === dockKey
        ? dock.getBoundingClientRect()
        : null;
    if (target !== null && node.parentNode !== target) target.appendChild(node);
    if (target === dock) dockKey = activeKey;
    if (flyFrom !== null && slot !== null) flyIn(slot.el, flyFrom);
  }

  const next: SurfaceSnapshot = slot !== null ? { mode: 'inline', layout: slot.layout } : { mode: 'mini', layout: 'default' };
  if (next.mode !== snapshot.mode || next.layout !== snapshot.layout) {
    snapshot = next;
    listeners.forEach((listener) => listener());
  }
}

export function setActiveSurfaceKey(key: string | null): void {
  if (key === activeKey) return;
  activeKey = key;
  place();
}

export function setDockTarget(el: HTMLElement | null): void {
  dock = el;
  place();
}

export function registerSlot(el: HTMLElement, layout: SlotLayout): SlotHandle {
  const slot: Slot = { el, key: null, layout };
  slots.push(slot);
  let released = false;
  return {
    claim: (key) => {
      if (released) return;
      slot.key = key;
      activeKey = key;
      place();
    },
    release: () => {
      if (released) return;
      released = true;
      const index = slots.indexOf(slot);
      if (index >= 0) slots.splice(index, 1);
      // Video soulevee par le geste : c'est lui qui termine (atterrissage).
      if (lifted !== null && liftedReleaseHook !== null) {
        const hook = liftedReleaseHook;
        liftedReleaseHook = null;
        hook();
        return;
      }
      // Synchrone, AVANT que React ne retire l'emplacement du DOM : la <video>
      // part dans le mini-lecteur sans jamais etre detachee du document
      // (meme en PiP : sinon elle partirait avec la page).
      if (frozen && slot.el.contains(getSurface())) {
        frozen = false;
        place();
        frozen = true;
        return;
      }
      place();
    },
  };
}

/** Un modal plein ecran s'ouvre : les emplacements dessous ne sont plus visibles. */
export function coverPlayerSlots(): () => void {
  covers += 1;
  place();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    covers -= 1;
    place();
  };
}

export function subscribeSurface(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSurfaceSnapshot(): SurfaceSnapshot {
  return snapshot;
}

/** Vignette du mini-lecteur (cible de l'atterrissage du geste). */
export function getDockTarget(): HTMLElement | null {
  return dock;
}

/** Image dans l'image ouverte / fermee : fige puis rejoue le placement. */
export function setSurfaceFrozen(value: boolean): void {
  if (frozen === value) return;
  frozen = value;
  if (!value) place();
}

/** Geste en cours : la video quitte sa page pour le calque flottant. */
export function liftSurface(layer: HTMLElement): void {
  lifted = layer;
  place();
}

/** Fin du geste : la video reprend sa place normale (page ou mini-lecteur). */
export function dropSurface(): void {
  lifted = null;
  liftedReleaseHook = null;
  place();
}

/** `hook` sera appele (une fois) quand la page de la video soulevee se fermera. */
export function onLiftedSlotReleased(hook: (() => void) | null): void {
  liftedReleaseHook = hook;
}
