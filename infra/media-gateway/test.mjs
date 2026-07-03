import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const gatewayPort = 18080;
const upstream = http.createServer((req, res) => {
  if (req.url === '/live/channel.m3u8') {
    res.writeHead(200, { 'content-type': 'application/vnd.apple.mpegurl' });
    res.end('#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="/keys/key.bin"\n#EXTINF:4,\nseg.ts\n');
    return;
  }
  if (req.url === '/seg.ts' && req.headers.range === 'bytes=0-3') {
    res.writeHead(206, {
      'accept-ranges': 'bytes',
      'content-range': 'bytes 0-3/8',
      'content-length': '4',
      'content-type': 'video/mp2t',
    });
    res.end('DATA');
    return;
  }
  res.writeHead(200, { 'content-type': 'application/octet-stream' }).end('KEY');
});

await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
const address = upstream.address();
assert(address && typeof address === 'object');
const upstreamOrigin = `http://127.0.0.1:${address.port}`;
const gateway = spawn(process.execPath, [fileURLToPath(new URL('./server.mjs', import.meta.url))], {
  env: {
    ...process.env,
    PORT: String(gatewayPort),
    UPSTREAM_ORIGIN: upstreamOrigin,
    PUBLIC_ORIGIN: 'https://media.test',
  },
  stdio: 'inherit',
});

async function waitUntilReady() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${gatewayPort}/_health`);
      if (response.ok) return;
    } catch {
      // Le processus demarre encore.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('La passerelle ne demarre pas.');
}

try {
  await waitUntilReady();
  const manifestTarget = `${upstreamOrigin}/live/channel.m3u8`;
  const manifest = await fetch(
    `http://127.0.0.1:${gatewayPort}/_fetch?url=${encodeURIComponent(manifestTarget)}`,
  ).then((response) => response.text());
  assert.match(manifest, /https:\/\/media\.test\/_fetch\?url=/);
  assert.match(manifest, /%2Fkeys%2Fkey\.bin/);
  assert.match(manifest, /%2Fseg\.ts/);

  const segment = await fetch(
    `http://127.0.0.1:${gatewayPort}/_fetch?url=${encodeURIComponent(`${upstreamOrigin}/seg.ts`)}`,
    { headers: { range: 'bytes=0-3' } },
  );
  assert.equal(segment.status, 206);
  assert.equal(segment.headers.get('content-range'), 'bytes 0-3/8');
  assert.equal(await segment.text(), 'DATA');
  process.stdout.write('Media gateway: HLS rewrite + Range OK\n');
} finally {
  gateway.kill();
  await new Promise((resolve) => upstream.close(resolve));
}
