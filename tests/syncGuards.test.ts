import { describe, expect, it } from 'vitest';
import { requireItems, requireList } from '@/services/sync/catalogSyncService';

describe('garde-fous de synchro', () => {
  it('refuse une reponse qui n’est pas une liste (le catalogue reste)', () => {
    expect(() => requireList({ user_info: { auth: 0 } }, 'films')).toThrow(/inattendue/);
    expect(() => requireList(null, 'films')).toThrow();
    expect(requireList([1, 2], 'films')).toEqual([1, 2]);
  });

  it('refuse une liste vide alors que la section a des categories', () => {
    expect(() => requireItems([], 12, 'films')).toThrow(/vide/);
    expect(requireItems([], 0, 'films')).toEqual([]);
  });
});
