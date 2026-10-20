// Banc d'essai Node du remuxeur MKV -> fMP4 : lit un MKV genere par ffmpeg,
// produit video.mp4 / audio.mp4 (init + segments) et un seek.mp4 (reprise a un
// cue), puis laisse ffprobe/ffmpeg juger.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { parseMatroskaHeader, parseCues } = require(process.env.MKV_TEST_JS + '/utils/matroska.js');
const { MkvRemuxer, selectTracks } = require(process.env.MKV_TEST_JS + '/utils/mkvRemuxer.js');

const [, , mkvPath, outDir, preferred = 'VF'] = process.argv;
fs.mkdirSync(outDir, { recursive: true });
const file = fs.readFileSync(mkvPath);
const all = new Uint8Array(file.buffer, file.byteOffset, file.byteLength);

const header = parseMatroskaHeader(all.subarray(0, 4 << 20));
console.log('header:', JSON.stringify({ docType: header.docType, tcs: header.timecodeScale, dur: header.durationSecs, segStart: header.segmentDataStart, firstCluster: header.firstClusterPos, cuesPos: header.cuesPos, tracks: header.tracks.map((t) => ({ n: t.number, type: t.type, codec: t.codecId, lang: t.language, dd: t.defaultDurationNs, priv: t.codecPrivate ? t.codecPrivate.length : null })) }));
if (header.firstClusterPos === null) throw new Error('premier cluster non trouve');

const mse = { isTypeSupported: () => true };
const sel = selectTracks(header, mse, preferred);
if (!sel.ok) throw new Error('selectTracks: ' + sel.error);
console.log('selection:', sel.videoMime, '|', sel.audioMime, '| audio track', sel.selection.audio && sel.selection.audio.number);

function run(startPos, label) {
  let audioInit = null;
  const remuxer = new MkvRemuxer(header, sel.selection, { videoMime: sel.videoMime, audioMime: sel.audioMime }, (init) => { audioInit = init; });
  const videoParts = [remuxer.videoInitSegment()];
  const audioParts = [];
  let segs = 0;
  const CHUNK = 64 * 1024;
  for (let p = startPos; p < all.length; p += CHUNK) {
    for (const s of remuxer.pushBytes(all.subarray(p, Math.min(all.length, p + CHUNK)))) {
      segs += 1;
      (s.track === 'video' ? videoParts : audioParts).push(s.data);
    }
  }
  for (const s of remuxer.flush()) {
    segs += 1;
    (s.track === 'video' ? videoParts : audioParts).push(s.data);
  }
  console.log(`[${label}] info:`, JSON.stringify(remuxer.info()), 'segments:', segs, 'audioInit:', audioInit ? audioInit.length : null);
  fs.writeFileSync(path.join(outDir, `${label}-video.mp4`), Buffer.concat(videoParts.map((b) => Buffer.from(b))));
  if (audioInit) fs.writeFileSync(path.join(outDir, `${label}-audio.mp4`), Buffer.concat([audioInit, ...audioParts].map((b) => Buffer.from(b))));
  return { hasAudio: !!audioInit };
}

const full = run(header.firstClusterPos, 'full');

// Seek : cues depuis SeekHead.
let cues = [];
if (header.cuesPos !== null) {
  cues = parseCues(all.subarray(header.cuesPos), header.segmentDataStart, header.timecodeScale, sel.selection.video.number);
}
console.log('cues:', cues.length, cues.slice(0, 4).map((c) => `${c.timeMs.toFixed(0)}ms@${c.clusterPos}`).join(' '));
let seek = null;
if (cues.length > 1) {
  const target = cues[Math.floor(cues.length / 2)];
  console.log('seek cue:', target);
  seek = run(target.clusterPos, 'seek');
}

function probe(f) {
  const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,codec_type,width,height,sample_rate,channels,nb_read_frames:format=duration', '-count_frames', '-of', 'json', f]).toString();
  const j = JSON.parse(out);
  return j.streams.map((s) => `${s.codec_type}:${s.codec_name}${s.width ? ` ${s.width}x${s.height}` : ''}${s.sample_rate ? ` ${s.sample_rate}Hz ${s.channels}ch` : ''} frames=${s.nb_read_frames}`).join(' ; ') + ` dur=${j.format.duration}`;
}
function decodeCheck(f) {
  try {
    const err = execFileSync('ffmpeg', ['-v', 'error', '-i', f, '-f', 'null', '-'], { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
    return err.trim() === '' ? 'decode OK' : 'decode warnings: ' + err.trim().split('\n').slice(0, 3).join(' | ');
  } catch (e) {
    return 'DECODE FAIL: ' + String(e.stderr || e.message).split('\n').slice(0, 3).join(' | ');
  }
}
function ptsCheck(f) {
  const out = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'frame=pts_time,pkt_dts_time,key_frame', '-of', 'json', f]).toString()).frames;
  const pts = out.map((x) => parseFloat(x.pts_time));
  const dts = out.map((x) => parseFloat(x.pkt_dts_time));
  let dtsMono = true;
  for (let i = 1; i < dts.length; i += 1) if (!(dts[i] > dts[i - 1])) dtsMono = false;
  let ptsLeDts = true;
  for (let i = 0; i < dts.length; i += 1) if (pts[i] < dts[i] - 1e-6) ptsLeDts = false;
  const sortedPts = [...pts].sort((a, b) => a - b);
  let maxStep = 0; let minStep = 1e9;
  for (let i = 1; i < sortedPts.length; i += 1) { const d = sortedPts[i] - sortedPts[i - 1]; maxStep = Math.max(maxStep, d); minStep = Math.min(minStep, d); }
  return `frames=${pts.length} firstPts=${sortedPts[0]} lastPts=${sortedPts[sortedPts.length - 1]} dtsMonotone=${dtsMono} pts>=dts=${ptsLeDts} ptsStep=[${minStep.toFixed(4)},${maxStep.toFixed(4)}] keyframes=${out.filter((x) => x.key_frame === 1).length}`;
}

for (const label of ['full', ...(seek ? ['seek'] : [])]) {
  for (const kind of ['video', 'audio']) {
    const f = path.join(outDir, `${label}-${kind}.mp4`);
    if (!fs.existsSync(f)) continue;
    console.log(`== ${label}-${kind}: ${probe(f)} | ${decodeCheck(f)}`);
    if (kind === 'video') console.log('   pts:', ptsCheck(f));
  }
}
console.log('source:', probe(mkvPath));
