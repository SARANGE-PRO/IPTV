import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/** Tests des briques PURES (aucun DOM, aucun Dexie) : `npm test`. */
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
