import { describe, expect, it } from 'vitest';
import { parseBackup } from '@/services/storage/personalDataService';

describe('parseBackup', () => {
  it('accepte une sauvegarde ZiBTV', () => {
    const b = { format: 'zibtv-backup', version: 1, exportedAt: 1, tables: { favorites: [{ type: 'vod', itemId: '1' }] } };
    expect(parseBackup(b)).not.toBeNull();
  });
  it('refuse tout autre fichier, une version future ou des tables mal formees', () => {
    expect(parseBackup({ hello: 1 })).toBeNull();
    expect(parseBackup(null)).toBeNull();
    expect(parseBackup({ format: 'zibtv-backup', version: 99, exportedAt: 1, tables: {} })).toBeNull();
    expect(parseBackup({ format: 'zibtv-backup', version: 1, exportedAt: 1, tables: { favorites: 'x' } })).toBeNull();
  });
});
