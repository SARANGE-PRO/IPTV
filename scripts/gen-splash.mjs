// Ecrans de lancement iOS (apple-touch-startup-image) : fond de l'app + « Z »
// de la marque centre. iOS n'affiche une image QUE si sa taille correspond
// exactement a l'ecran (media query) : une image par format d'appareil.
// Usage : npm run splash  (regenere public/splash + src/config/splashScreens.ts)
import { Resvg } from '@resvg/resvg-js';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mark = readFileSync(resolve(root, 'public/brand/zibtv-mark.svg'), 'utf8');
const markInner = mark.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
const BG = '#08080A';

/** [largeur CSS, hauteur CSS, densite] en portrait. */
const PHONES = [
  [440, 956, 3], [430, 932, 3], [402, 874, 3], [393, 852, 3], [428, 926, 3], [390, 844, 3],
  [375, 812, 3], [414, 896, 3], [414, 896, 2], [414, 736, 3], [375, 667, 2], [320, 568, 2],
];
const TABLETS = [
  [1032, 1376, 2], [1024, 1366, 2], [834, 1210, 2], [834, 1194, 2], [834, 1112, 2], [820, 1180, 2],
  [810, 1080, 2], [768, 1024, 2], [744, 1133, 2],
];

mkdirSync(resolve(root, 'public/splash'), { recursive: true });
const entries = [];

function render(w, h, dpr, orientation) {
  const W = w * dpr;
  const H = h * dpr;
  const size = Math.round(Math.min(W, H) * 0.26);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<rect width="100%" height="100%" fill="${BG}"/>
<svg x="${Math.round((W - size) / 2)}" y="${Math.round((H - size) / 2)}" width="${size}" height="${size}" viewBox="0 0 100 100">${markInner}</svg>
</svg>`;
  const file = `splash/${W}x${H}.png`;
  writeFileSync(resolve(root, 'public', file), new Resvg(svg).render().asPng());
  entries.push({
    url: `/${file}`,
    media: `(device-width: ${Math.min(w, h)}px) and (device-height: ${Math.max(w, h)}px) and (-webkit-device-pixel-ratio: ${dpr}) and (orientation: ${orientation})`,
  });
}

for (const [w, h, dpr] of PHONES) render(w, h, dpr, 'portrait');
for (const [w, h, dpr] of TABLETS) {
  render(w, h, dpr, 'portrait');
  render(h, w, dpr, 'landscape');
}

writeFileSync(
  resolve(root, 'src/config/splashScreens.ts'),
  `// Genere par scripts/gen-splash.mjs — ne pas modifier a la main.\n` +
    `export const SPLASH_SCREENS: { url: string; media: string }[] = ${JSON.stringify(entries, null, 2)};\n`,
);
console.log(`ok ${entries.length} ecrans de lancement`);
