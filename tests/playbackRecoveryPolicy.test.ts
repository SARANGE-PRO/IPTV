import { describe, expect, it } from 'vitest';
import {
  autoResumeTimeout,
  canAutoResume,
  isStarvedPause,
  recoveryBudget,
  resumePosition,
  retryDelay,
  stallTimeout,
  startupTimeout,
} from '@/services/player/playbackRecoveryPolicy';

describe('relances', () => {
  it('espace les relances puis abandonne', () => {
    expect(retryDelay('live', 0)).toBe(800);
    expect(retryDelay('live', 2)).toBe(5000);
    expect(retryDelay('live', 3)).toBeNull();
    expect(retryDelay('vod', 0)).toBe(1000);
  });

  it('budget : live toujours 3, VOD selon l’erreur', () => {
    expect(recoveryBudget('live', 4, false)).toBe(3);
    expect(recoveryBudget('vod', 1, true)).toBe(0); // arret volontaire
    expect(recoveryBudget('vod', 4, false)).toBe(1); // format illisible avant demarrage
    expect(recoveryBudget('vod', 4, true)).toBe(3);
    expect(recoveryBudget('vod', 2, true)).toBe(3); // reseau
  });

  it('delais de garde', () => {
    expect(startupTimeout('live', 0)).toBeGreaterThan(startupTimeout('live', 1));
    expect(stallTimeout('vod', true)).toBeGreaterThan(stallTimeout('vod', false));
    expect(stallTimeout('live', false)).toBe(10_000);
  });
});

describe('pause subie (tampon vide)', () => {
  it('tampon a sec ou attente en cours = pause subie', () => {
    expect(isStarvedPause({ bufferAhead: 0.2, readyState: 4, starving: false })).toBe(true);
    expect(isStarvedPause({ bufferAhead: 5, readyState: 2, starving: false })).toBe(true);
    expect(isStarvedPause({ bufferAhead: 5, readyState: 4, starving: true })).toBe(true);
  });

  it('tampon sain = pause voulue', () => {
    expect(isStarvedPause({ bufferAhead: 6, readyState: 4, starving: false })).toBe(false);
  });

  it('reprise des que le tampon est reconstitue', () => {
    expect(canAutoResume('live', 2, 3)).toBe(true);
    expect(canAutoResume('live', 1, 3)).toBe(false);
    expect(canAutoResume('vod', 3, 3)).toBe(false);
    expect(canAutoResume('vod', 0, 4)).toBe(true); // HAVE_ENOUGH_DATA
    expect(autoResumeTimeout('vod')).toBeGreaterThan(autoResumeTimeout('live'));
  });
});

describe('position de reprise VOD', () => {
  it('reprend a la derniere position si elle depasse le depart', () => {
    expect(resumePosition(0, 120)).toBe(120);
    expect(resumePosition(100, 101)).toBe(100);
    expect(resumePosition(30, null)).toBe(30);
  });
});
