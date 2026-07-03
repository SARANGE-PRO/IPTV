// Genere les fallbacks PNG PWA/iOS depuis l'icone SVG canonique ZiBTV.
import { Resvg } from '@resvg/resvg-js';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicRoot = resolve(projectRoot, 'public');
const source = readFileSync(resolve(publicRoot, 'brand', 'zibtv-icon.svg'), 'utf8');

mkdirSync(resolve(publicRoot, 'icons'), { recursive: true });

const targets = [
  ['icons/icon-32.png', 32],
  ['icons/icon-192.png', 192],
  ['icons/icon-512.png', 512],
  ['icons/maskable-512.png', 512],
  ['apple-touch-icon.png', 180],
];

for (const [relativePath, size] of targets) {
  const renderer = new Resvg(source, {
    fitTo: { mode: 'width', value: size },
  });
  writeFileSync(resolve(publicRoot, relativePath), renderer.render().asPng());
  console.log(`ok ${relativePath} (${size}px)`);
}
