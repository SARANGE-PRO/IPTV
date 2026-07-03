import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const output = fileURLToPath(new URL('./.pages-dist/', import.meta.url));

await mkdir(output, { recursive: true });
await copyFile(`${root}worker.mjs`, `${output}_worker.js`);
await writeFile(`${output}index.html`, '<!doctype html><title>IPTV media gateway</title>');
