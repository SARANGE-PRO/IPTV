// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Image dans l'image : (1) l'API webkit (iOS) est bien pilotee, (2) la
 * surface du lecteur unique ne deplace plus la video tant que le PiP est
 * ouvert — sauf si sa page se ferme (sinon la video partirait avec elle).
 */

type Surface = typeof import('@/components/player/host/playerSurface');

async function freshSurface(): Promise<Surface> {
  vi.resetModules();
  return import('@/components/player/host/playerSurface');
}

function setup(surface: Surface) {
  document.body.innerHTML = '';
  const page = document.createElement('div');
  const dock = document.createElement('div');
  document.body.append(page, dock);
  surface.setDockTarget(dock);
  const node = surface.getSurface();
  return { page, dock, node };
}

describe('surface du lecteur pendant le PiP', () => {
  let surface: Surface;
  beforeEach(async () => {
    surface = await freshSurface();
  });

  it('sans PiP : la video suit sa page puis le mini-lecteur', () => {
    const { page, dock, node } = setup(surface);
    const slot = surface.registerSlot(page, 'default');
    slot.claim('s1');
    expect(node.parentNode).toBe(page);
    expect(surface.getSurfaceSnapshot().mode).toBe('inline');
    slot.release();
    expect(node.parentNode).toBe(dock);
    expect(surface.getSurfaceSnapshot().mode).toBe('mini');
  });

  it('en PiP : une fiche qui s’ouvre ne deplace pas la video ; elle bouge a la sortie du PiP', () => {
    const { page, dock, node } = setup(surface);
    surface.registerSlot(page, 'default').claim('s1');
    surface.setSurfaceFrozen(true);
    const uncover = surface.coverPlayerSlots(); // fiche plein ecran par-dessus
    expect(node.parentNode).toBe(page); // pas touchee pendant le PiP
    expect(surface.getSurfaceSnapshot().mode).toBe('mini'); // l'etat, lui, suit
    surface.setSurfaceFrozen(false);
    expect(node.parentNode).toBe(dock);
    uncover();
    expect(node.parentNode).toBe(page);
  });

  it('en PiP : la page qui se ferme emmene la video au mini-lecteur (jamais detachee)', () => {
    const { page, dock, node } = setup(surface);
    const slot = surface.registerSlot(page, 'default');
    slot.claim('s1');
    surface.setSurfaceFrozen(true);
    slot.release();
    expect(node.parentNode).toBe(dock);
    expect(node.isConnected).toBe(true);
  });

  it('en PiP depuis le mini-lecteur : rouvrir la page attend la fin du PiP', () => {
    const { page, dock, node } = setup(surface);
    surface.setActiveSurfaceKey('s1');
    expect(node.parentNode).toBe(dock);
    surface.setSurfaceFrozen(true);
    surface.registerSlot(page, 'default').claim('s1');
    expect(node.parentNode).toBe(dock);
    surface.setSurfaceFrozen(false);
    expect(node.parentNode).toBe(page);
  });
});

describe('API PiP (Safari iOS)', () => {
  function webkitVideo() {
    const video = document.createElement('video') as HTMLVideoElement & {
      webkitSupportsPresentationMode: (mode: string) => boolean;
      webkitSetPresentationMode: (mode: string) => void;
      webkitPresentationMode: string;
    };
    video.webkitPresentationMode = 'inline';
    Object.defineProperty(video, 'readyState', { value: 4 }); // video demarree
    video.webkitSupportsPresentationMode = (mode) => mode === 'picture-in-picture';
    video.webkitSetPresentationMode = (mode) => {
      video.webkitPresentationMode = mode;
      video.dispatchEvent(new Event('webkitpresentationmodechanged'));
    };
    return video;
  }

  it('ouvre, signale puis referme le PiP', async () => {
    const pip = await import('@/services/player/pictureInPicture');
    const video = webkitVideo();
    const changes: boolean[] = [];
    const stop = pip.onPipChange(video, (inPip) => changes.push(inPip));
    expect(pip.pipSupported(video)).toBe(true);
    vi.useFakeTimers();
    const opening = pip.togglePip(video);
    expect(pip.isInPip(video)).toBe(true); // ouvert DANS l'appel (geste iOS)
    vi.advanceTimersByTime(1000);
    await expect(opening).resolves.toBeNull();
    await pip.togglePip(video);
    expect(pip.isInPip(video)).toBe(false);
    expect(changes).toEqual([true, false]);
    vi.useRealTimers();
    stop();
  });

  it('refus silencieux d’iOS : un motif est rendu au lieu de rien', async () => {
    const pip = await import('@/services/player/pictureInPicture');
    const video = webkitVideo();
    video.webkitSetPresentationMode = () => undefined; // iOS ignore la demande
    vi.useFakeTimers();
    const opening = pip.enterPip(video);
    vi.advanceTimersByTime(1000);
    await expect(opening).resolves.toMatch(/iOS/);
    vi.useRealTimers();
  });

  it('navigateur sans PiP : bouton masque', async () => {
    const pip = await import('@/services/player/pictureInPicture');
    expect(pip.pipSupported(document.createElement('video'))).toBe(false);
  });
});
