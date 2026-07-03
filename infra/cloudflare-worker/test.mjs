import assert from 'node:assert/strict';
import http from 'node:http';
import worker from './worker.mjs';

const upstream = http.createServer((req, res) => {
  if (req.url === '/live/channel.m3u8') {
    res.writeHead(200, { 'content-type': 'application/vnd.apple.mpegurl' });
    res.end('#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="/key.bin"\n#EXTINF:4,\nseg.ts\n');
    return;
  }
  if (req.url === '/seg.ts' && req.headers.range === 'bytes=0-3') {
    res.writeHead(206, {
      'content-range': 'bytes 0-3/8',
      'content-length': '4',
      'content-type': 'video/mp2t',
    });
    res.end('DATA');
    return;
  }
  res.writeHead(200).end('KEY');
});

await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
const address = upstream.address();
assert(address && typeof address === 'object');
const origin = `http://127.0.0.1:${address.port}`;
const env = { UPSTREAM_ORIGIN: origin };

try {
  const manifestTarget = `${origin}/live/channel.m3u8`;
  const manifestResponse = await worker.fetch(
    new Request(`https://worker.test/_fetch?url=${encodeURIComponent(manifestTarget)}`),
    env,
  );
  assert.equal(manifestResponse.status, 200);
  const manifest = await manifestResponse.text();
  assert.match(manifest, /https:\/\/worker\.test\/_fetch\?url=/);
  assert.match(manifest, /%2Fkey\.bin/);
  assert.match(manifest, /%2Fseg\.ts/);

  const segmentResponse = await worker.fetch(
    new Request(`https://worker.test/_fetch?url=${encodeURIComponent(`${origin}/seg.ts`)}`, {
      headers: { range: 'bytes=0-3' },
    }),
    env,
  );
  assert.equal(segmentResponse.status, 206);
  assert.equal(segmentResponse.headers.get('content-range'), 'bytes 0-3/8');
  assert.equal(await segmentResponse.text(), 'DATA');
  process.stdout.write('Cloudflare Worker: HLS rewrite + Range OK\n');
} finally {
  await new Promise((resolve) => upstream.close(resolve));
}
