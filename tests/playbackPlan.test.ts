import { describe, expect, it } from 'vitest';
import { planSourceProps } from '@/services/player/playbackPlanService';

describe('planSourceProps', () => {
  it('direct : reprise par seek, rien de transcode', () => {
    expect(planSourceProps('direct', 120, true)).toEqual({
      transcode: false,
      directMkv: false,
      preferHls: false,
      startAt: 120,
      startOffset: 0,
    });
  });

  it('MKV direct : remux in-app, reprise par seek', () => {
    expect(planSourceProps('direct-mkv', 90, true)).toMatchObject({ directMkv: true, transcode: false, startAt: 90, startOffset: 0 });
  });

  it('passerelle + HLS natif (Safari) : reprise par OFFSET serveur', () => {
    expect(planSourceProps('gateway', 300, true)).toEqual({
      transcode: true,
      directMkv: false,
      preferHls: true,
      startAt: 0,
      startOffset: 300,
    });
  });

  it('passerelle sans HLS natif : fMP4 progressif, reprise par seek', () => {
    expect(planSourceProps('gateway', 300, false)).toMatchObject({ transcode: true, preferHls: false, startAt: 300, startOffset: 0 });
  });
});
