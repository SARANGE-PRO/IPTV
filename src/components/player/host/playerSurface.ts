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
 *  - sinon : mini-lecteur.
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

let surface: HTMLDivElement | null = null;
let dock: HTMLElement | null = null;
let activeKey: string | null = null;
let covers = 0;
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

function place(): void {
  let slot: Slot | null = null;
  for (let i = slots.length - 1; i >= 0; i -= 1) {
    const candidate = slots[i];
    if (candidate !== undefined && eligible(candidate)) {
      slot = candidate;
      break;
    }
  }
  const target = slot?.el ?? dock;
  const node = getSurface();
  if (target !== null && node.parentNode !== target) target.appendChild(node);

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
      // Synchrone, AVANT que React ne retire l'emplacement du DOM : la <video>
      // part dans le mini-lecteur sans jamais etre detachee du document.
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
