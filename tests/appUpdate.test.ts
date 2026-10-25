import { describe, expect, it } from 'vitest';
import { isChunkLoadError } from '@/services/appUpdateService';

describe('isChunkLoadError', () => {
  it('reconnait les fichiers du build introuvables (webpack, Safari, Chrome)', () => {
    expect(isChunkLoadError(Object.assign(new Error('x'), { name: 'ChunkLoadError' }))).toBe(true);
    expect(isChunkLoadError(new Error('Loading chunk 812 failed.'))).toBe(true);
    expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: x.js'))).toBe(true);
  });
  it('ignore les autres erreurs', () => {
    expect(isChunkLoadError(new Error('network'))).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
  });
});
