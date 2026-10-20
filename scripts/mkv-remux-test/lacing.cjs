// Test unitaire du lecteur de Clusters : lacing EBML, Xiph, fixe + BlockGroup.
const { MatroskaClusterReader } = require(process.env.MKV_TEST_JS + '/utils/matroska.js');

function idBytes(id) { const o = []; let v = id; while (v > 0) { o.unshift(v & 0xff); v = Math.floor(v / 256); } return o; }
function size8(n) { const o = new Array(8).fill(0); o[0] = 0x01; let v = n; for (let i = 7; i >= 1; i -= 1) { o[i] = v & 0xff; v = Math.floor(v / 256); } return o; }
function el(id, payload) { return [...idBytes(id), ...size8(payload.length), ...payload]; }
const frameA = [1, 1, 1], frameB = [2, 2, 2, 2], frameC = [3, 3];

// SimpleBlock : track 2 (0x82), timecode 10 (0x00 0x0A), flags
function simpleBlock(flags, body) { return el(0xa3, [0x82, 0x00, 0x0a, flags, ...body]); }
// EBML lacing (0x06) : 3 trames ; tailles : 3 (vint 0x83), delta +1 (vint 1 octet biais 63 -> 0x80|64)
const ebmlLaced = simpleBlock(0x80 | 0x06, [2, 0x83, 0x80 | 64, ...frameA, ...frameB, ...frameC]);
// Xiph lacing (0x02) : tailles 3, 4
const xiphLaced = simpleBlock(0x80 | 0x02, [2, 3, 4, ...frameA, ...frameB, ...frameC]);
// Fixed lacing (0x04) : 3 trames de 3 octets
const fixedLaced = simpleBlock(0x80 | 0x04, [2, 1, 1, 1, 2, 2, 2, 3, 3, 3]);
// BlockGroup avec ReferenceBlock -> non keyframe
const blockGroup = el(0xa0, [...el(0xa1, [0x81, 0x00, 0x05, 0x00, 9, 9]), ...el(0xfb, [0x7f])]);
const cluster = [...idBytes(0x1f43b675), 0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, ...el(0xe7, [0x03, 0xe8]), ...ebmlLaced, ...xiphLaced, ...fixedLaced, ...blockGroup];
// Un gros element inconnu (Tags) plus grand que le tampon, suivi d'un 2e cluster.
const tags = [...idBytes(0x1254c367), ...size8(50000), ...new Array(50000).fill(7)];
const cluster2 = [...idBytes(0x1f43b675), 0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, ...el(0xe7, [0x07, 0xd0]), ...simpleBlock(0x80, [5, 5, 5, 5, 5])];
const all = new Uint8Array([...cluster, ...tags, ...cluster2]);

const reader = new MatroskaClusterReader(1000000, new Map([[2, 32]]));
const blocks = [];
// Pousse par petits morceaux irreguliers pour tester l'incremental.
for (let p = 0; p < all.length; p += 7) blocks.push(...reader.push(all.subarray(p, Math.min(all.length, p + 7))));
const summary = blocks.map((b) => `${b.trackNumber}@${b.timeMs.toFixed(0)}${b.keyframe ? 'K' : ''}[${Array.from(b.data).join('')}]`).join(' ');
console.log(summary);
const expect = '2@1010K[111] 2@1042K[2222] 2@1074K[33] 2@1010K[111] 2@1042K[2222] 2@1074K[33] 2@1010K[111] 2@1042K[222] 2@1074K[333] 1@1005[99] 2@2010K[55555]';
console.log(summary === expect ? 'LACING OK' : 'LACING FAIL\nattendu: ' + expect);
process.exit(summary === expect ? 0 : 1);
