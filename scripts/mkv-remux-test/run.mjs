#!/usr/bin/env node
/**
 * `npm run test:mkv` — banc d'essai du remux MKV -> fMP4 (sans navigateur).
 * Exige ffmpeg/ffprobe (libx264, libx265, aac, ac3, eac3). Etapes :
 *  1. compile les briques pures (utils/matroska, audioCodecs, fmp4, mkvRemuxer) en CommonJS ;
 *  2. test unitaire du lecteur de Clusters (lacing EBML/Xiph/fixe, BlockGroup, saut d'element) ;
 *  3. genere des MKV de test (H.264 + AAC + AC-3 avec B-frames ; HEVC + E-AC-3) ;
 *  4. remuxe (lecture complete + reprise a un cue) et fait valider la sortie par ffprobe/ffmpeg.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const here = resolve(import.meta.dirname);
const root = resolve(here, '..', '..');
const work = resolve(root, '.mkv-remux-test');
const js = resolve(work, 'js');
const media = resolve(work, 'media');
mkdirSync(media, { recursive: true });

const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: 'inherit', cwd: root, ...opts });
const env = { ...process.env, MKV_TEST_JS: js };

console.log('--- 1. compilation');
try {
  run(process.execPath, [resolve(root, 'node_modules/typescript/bin/tsc'), '-p', resolve(here, 'tsconfig.json')], { stdio: 'ignore' });
} catch {
  // Erreurs de chemins d'alias attendues (types seulement) : l'emission a eu lieu.
}
if (!existsSync(resolve(js, 'utils/mkvRemuxer.js'))) throw new Error('compilation echouee');

console.log('--- 2. lecteur de clusters (lacing)');
run(process.execPath, [resolve(here, 'lacing.cjs')], { env });

console.log('--- 3. fichiers de test');
const h264 = resolve(media, 'h264.mkv');
const hevc = resolve(media, 'hevc.mkv');
if (!existsSync(h264)) {
  run('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=25', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-f', 'lavfi', '-i', 'sine=frequency=880:sample_rate=48000', '-t', '12', '-map', '0:v', '-map', '1:a', '-map', '2:a', '-c:v', 'libx264', '-preset', 'veryfast', '-bf', '3', '-g', '50', '-pix_fmt', 'yuv420p', '-c:a:0', 'aac', '-b:a:0', '96k', '-c:a:1', 'ac3', '-ac', '2', '-metadata:s:a:0', 'language=fre', '-metadata:s:a:1', 'language=eng', h264]);
}
if (!existsSync(hevc)) {
  run('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=24', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '10', '-map', '0:v', '-map', '1:a', '-c:v', 'libx265', '-preset', 'ultrafast', '-x265-params', 'bframes=3:log-level=error', '-pix_fmt', 'yuv420p', '-tag:v', 'hvc1', '-c:a', 'eac3', '-b:a', '128k', '-ac', '2', hevc]);
}

console.log('--- 4. remux + validation ffmpeg');
run(process.execPath, [resolve(here, 'harness.cjs'), h264, resolve(work, 'out-h264-vf'), 'VF'], { env });
run(process.execPath, [resolve(here, 'harness.cjs'), h264, resolve(work, 'out-h264-vo'), 'VO'], { env });
run(process.execPath, [resolve(here, 'harness.cjs'), hevc, resolve(work, 'out-hevc'), 'VF'], { env });
console.log('--- OK');
