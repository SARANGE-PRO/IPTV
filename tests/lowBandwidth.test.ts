import { beforeEach, describe, expect, it, vi } from 'vitest';
import { liveDelaySeconds } from '@/services/player/playbackRecoveryPolicy';

const store = new Map<string, unknown>();
vi.mock('@/db/repositories/settingsRepository', () => ({
  getSetting: async (key: string) => store.get(key),
  setSetting: async (key: string, value: unknown) => {
    store.set(key, value);
  },
}));

type Svc = typeof import('@/services/network/lowBandwidthService');
async function fresh(): Promise<Svc> {
  vi.resetModules();
  return import('@/services/network/lowBandwidthService');
}

beforeEach(() => store.clear());

describe('proposition du mode connexion faible', () => {
  it('jamais au moindre ralentissement : 3 incidents en 5 min, ou un abandon reseau', async () => {
    const { shouldPropose } = await fresh();
    const now = 1_000_000;
    const base = { now, enabled: false, declined: false, networkFailure: false };
    expect(shouldPropose({ ...base, incidents: [now - 1000, now - 2000] })).toBe(false);
    expect(shouldPropose({ ...base, incidents: [now - 1000, now - 2000, now - 3000] })).toBe(true);
    expect(shouldPropose({ ...base, incidents: [now - 1000, now - 2000, now - 6 * 60_000] })).toBe(false);
    expect(shouldPropose({ ...base, incidents: [], networkFailure: true })).toBe(true);
  });

  it('ni si le mode est deja actif, ni apres un refus', async () => {
    const svc = await fresh();
    const incidents = [Date.now(), Date.now(), Date.now()];
    svc.declineProposal();
    svc.considerProposal(incidents, true);
    expect(svc.isProposed()).toBe(false);
  });

  it('activer retire la proposition', async () => {
    const svc = await fresh();
    svc.considerProposal([Date.now(), Date.now(), Date.now()], false);
    expect(svc.isProposed()).toBe(true);
    svc.setLowBandwidth(true);
    expect(svc.isProposed()).toBe(false);
    expect(svc.isLowBandwidth()).toBe(true);
  });
});

describe('duree du mode', () => {
  it('reste actif au relancement, s’eteint apres 3 h sans lecture', async () => {
    let svc = await fresh();
    svc.setLowBandwidth(true);
    await Promise.resolve();
    const stored = store.get('lowBandwidth') as { lastPlaybackAt: number };

    svc = await fresh();
    await svc.hydrateLowBandwidth(stored.lastPlaybackAt + 60 * 60_000);
    expect(svc.isLowBandwidth()).toBe(true);

    svc = await fresh();
    await svc.hydrateLowBandwidth(stored.lastPlaybackAt + svc.LOW_BANDWIDTH_IDLE_OFF_MS + 1);
    expect(svc.isLowBandwidth()).toBe(false);
  });

  it('les taches en attente repartent a la sortie du mode', async () => {
    const svc = await fresh();
    svc.setLowBandwidth(true);
    let released = false;
    void svc.whenBandwidthAllows().then(() => (released = true));
    await Promise.resolve();
    expect(released).toBe(false);
    svc.setLowBandwidth(false);
    await Promise.resolve();
    expect(released).toBe(true);
  });
});

describe('retard sur le direct', () => {
  it('jusqu’a 30 s, borne par la fenetre de la playlist', () => {
    expect(liveDelaySeconds(0, 60)).toBe(30);
    expect(liveDelaySeconds(100, 130)).toBe(20); // fenetre 30 s - marge 10 s
    expect(liveDelaySeconds(0, 12)).toBeNull(); // fenetre trop courte : rester au direct
    expect(liveDelaySeconds(0, Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe('activite de lecture', () => {
  it('les taches de fond attendent la fin de la lecture', async () => {
    vi.resetModules();
    const act = await import('@/services/player/playbackActivity');
    const end = act.markPlaybackActive();
    expect(act.isPlaybackActive()).toBe(true);
    let resumed = false;
    void act.whenPlaybackIdle().then(() => (resumed = true));
    await Promise.resolve();
    expect(resumed).toBe(false);
    end();
    end(); // idempotent
    await Promise.resolve();
    expect(resumed).toBe(true);
    expect(act.isPlaybackActive()).toBe(false);
  });
});
