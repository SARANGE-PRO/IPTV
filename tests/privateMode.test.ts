// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { fingerprint, isPinValid, pinLockedUntil, tryUnlock } from '@/services/privacy/privateModeService';

beforeEach(() => window.sessionStorage.clear());

describe('code du mode prive', () => {
  it('accepte 0809 seulement', () => {
    expect(isPinValid('0809')).toBe(true);
    for (const pin of ['0000', '8090', '0808', '080', '08090', 'abcd']) expect(isPinValid(pin)).toBe(false);
  });

  it('le code n’est pas en clair (empreinte stable)', () => {
    expect(fingerprint('zibtv-prive:0809')).toBe('e3a2775a');
  });

  it('5 erreurs : saisie bloquee 60 s, puis de nouveau possible', () => {
    const t = 1_000_000;
    for (let i = 0; i < 4; i += 1) expect(tryUnlock('1111', t)).toBe('wrong');
    expect(tryUnlock('1111', t)).toBe('locked');
    expect(tryUnlock('0809', t + 1000)).toBe('locked');
    expect(pinLockedUntil(t + 1000)).toBe(t + 60_000);
    expect(tryUnlock('0809', t + 61_000)).toBe('ok');
  });
});
