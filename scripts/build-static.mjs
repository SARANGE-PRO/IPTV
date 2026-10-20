#!/usr/bin/env node
/**
 * Build STATIQUE de la coquille HTTP (GitHub Pages ou tout hebergeur de
 * fichiers) : `npm run build:static` -> dossier `out/`.
 *
 * Next ne sait pas exporter les Route Handlers dynamiques (/api/xtream POST…) :
 * on ecarte `src/app/api` le temps du build (puis on le remet, meme en cas
 * d'echec). Ces routes restent servies par Vercel ; la coquille les appelle via
 * NEXT_PUBLIC_API_BASE_URL (voir services/apiBase.ts).
 *
 * Variables lues : NEXT_PUBLIC_API_BASE_URL (obligatoire en pratique),
 * NEXT_PUBLIC_MEDIA_GATEWAY_URL (optionnel), PAGES_CUSTOM_DOMAIN (-> out/CNAME).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const apiDir = resolve(root, 'src/app/api');
const parkedDir = resolve(root, '.api-excluded');
const outDir = resolve(root, 'out');

if (!process.env.NEXT_PUBLIC_API_BASE_URL) {
  console.warn('[build-static] NEXT_PUBLIC_API_BASE_URL absent : les appels /api/* viseront la coquille elle-meme et echoueront.');
}

const env = {
  ...process.env,
  NEXT_OUTPUT: 'export',
  NEXT_PUBLIC_PLAIN_HTTP: '1',
  NEXT_TELEMETRY_DISABLED: '1',
};

// Cache/typages d'un build precedent referencent src/app/api : on repart propre.
rmSync(resolve(root, '.next'), { recursive: true, force: true });
rmSync(outDir, { recursive: true, force: true });
if (existsSync(parkedDir)) rmSync(parkedDir, { recursive: true, force: true });

const restore = () => {
  if (existsSync(parkedDir) && !existsSync(apiDir)) renameSync(parkedDir, apiDir);
};
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    restore();
    process.exit(1);
  });
}

renameSync(apiDir, parkedDir);
try {
  execFileSync(process.execPath, [resolve(root, 'node_modules/next/dist/bin/next'), 'build'], {
    cwd: root,
    env,
    stdio: 'inherit',
  });
} finally {
  restore();
}

// GitHub Pages : sans .nojekyll, Jekyll ignore les dossiers _next/.
writeFileSync(resolve(outDir, '.nojekyll'), '');
const domain = process.env.PAGES_CUSTOM_DOMAIN?.trim();
if (domain) writeFileSync(resolve(outDir, 'CNAME'), `${domain}\n`);
console.log(`[build-static] OK -> ${outDir}${domain ? ` (CNAME ${domain})` : ''}`);
