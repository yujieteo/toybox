// Imports the curated CC0 models in tools/assets/sources.json (Kenney and Poly Haven) into Toybox.
// For each asset it checks that the source page states CC0, downloads the files (or reads them from
// the cache), flattens the node transforms, groups the triangles by base colour, scales to metres
// with the base at y=0, and writes assets/models/<id>.bin. Then it writes assets/models/index.json,
// assets/ATTRIBUTION.md and assets/catalogue.json (through core/kit.mjs).
// Run: node tools/assets/import.mjs [--cache /tmp/toybox-assets/cache]
//
// Mesh file (little-endian): u32 magic "TBM1", u32 group count G, f32 position scale S,
// G x u32 vertex count, then for each group and each vertex 6 x i16: x, y, z (times S gives metres)
// and nx, ny, nz (divided by 32767). Three vertices make one triangle. Group i has the colour
// groups[i] in the catalogue entry.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { inflateRawSync, inflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { writeCatalogue } from '../../core/kit.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ASSETS = join(here, '..', '..', 'assets');
const MAX_TRIS = 8000;   // keeps one colour group well inside the 4 MB engine upload buffer
const CC0 = 'creativecommons.org/publicdomain/zero/1.0';
const UA = { 'user-agent': 'Toybox asset import (CC0 models)' };

// ---- download with a file cache
async function fetchBuf(url, cacheFile) {
  if (cacheFile && existsSync(cacheFile)) return readFileSync(cacheFile);
  const r = await fetch(url, { headers: UA });
  if (!r.ok) throw new Error(`${r.status} for ${url}`);
  const b = Buffer.from(await r.arrayBuffer());
  if (cacheFile) { mkdirSync(dirname(cacheFile), { recursive: true }); writeFileSync(cacheFile, b); }
  return b;
}
async function pageWithCC0(url) {
  // A query string skips the page cache: Kenney download links in a cached page can be expired.
  const html = (await fetchBuf(`${url}?t=${Date.now()}`)).toString('utf8');
  if (!html.includes(CC0)) throw new Error(`${url} does not state CC0`);
  return html;
}

// ---- zip (Kenney kits): read one entry
function unzip(zip, suffix) {
  let e = zip.length - 22;
  while (e >= 0 && zip.readUInt32LE(e) !== 0x06054b50) e--;
  let p = zip.readUInt32LE(e + 16);
  const n = zip.readUInt16LE(e + 10);
  for (let i = 0; i < n; i++) {
    const method = zip.readUInt16LE(p + 10), csize = zip.readUInt32LE(p + 20);
    const nl = zip.readUInt16LE(p + 28), xl = zip.readUInt16LE(p + 30), cl = zip.readUInt16LE(p + 32), off = zip.readUInt32LE(p + 42);
    const name = zip.subarray(p + 46, p + 46 + nl).toString('utf8');
    if (name.endsWith(suffix)) {
      const start = off + 30 + zip.readUInt16LE(off + 26) + zip.readUInt16LE(off + 28);
      const data = zip.subarray(start, start + csize);
      return method === 0 ? Buffer.from(data) : inflateRawSync(data);
    }
    p += 46 + nl + xl + cl;
  }
  throw new Error(`no ${suffix} in the archive`);
}

// ---- PNG (8 or 16 bits: grey, RGB, RGBA, palette; not interlaced): returns { w, h, rgb(x, y) }
function png(buf) {
  let p = 8, w, h, depth, type, pal; const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), t = buf.toString('ascii', p + 4, p + 8), d = buf.subarray(p + 8, p + 8 + len);
    if (t === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); depth = d[8]; type = d[9]; if (d[12]) throw new Error('interlaced PNG'); }
    else if (t === 'PLTE') pal = d; else if (t === 'IDAT') idat.push(d); else if (t === 'IEND') break;
    p += 12 + len;
  }
  if (depth !== 8 && depth !== 16) throw new Error(`PNG bit depth ${depth}`);
  const ch = depth / 8, bpp = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type] * ch, stride = w * bpp, raw = inflateSync(Buffer.concat(idat));
  const px = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, o = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[o + x - bpp] : 0, b = y ? px[o - stride + x] : 0, c = x >= bpp && y ? px[o - stride + x - bpp] : 0;
      let v = raw[src + x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      px[o + x] = v & 255;
    }
  }
  return {
    w, h, rgb(x, y) {
      const i = y * stride + x * bpp;
      if (type === 3) return [pal[px[i] * 3], pal[px[i] * 3 + 1], pal[px[i] * 3 + 2]];
      if (type === 0 || type === 4) return [px[i], px[i], px[i]];
      return [px[i], px[i + ch], px[i + 2 * ch]];   // the high byte of a 16-bit sample comes first
    },
  };
}

// ---- glTF: flatten every triangle of the default scene to world space with a colour
function mat4(n) {
  if (n.matrix) return n.matrix;
  const [x, y, z, w] = n.rotation || [0, 0, 0, 1], [sx, sy, sz] = n.scale || [1, 1, 1], [tx, ty, tz] = n.translation || [0, 0, 0];
  return [(1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0, tx, ty, tz, 1];
}
const mul = (a, b) => { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; };
function normalMat(m) {   // inverse transpose of the upper 3x3, column-major
  const [a, b, c, d, e, f, g, h, i] = [m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]];
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, det = a * A + b * B + c * C;
  return { det, n: [A, -(b * i - c * h), b * f - c * e, B, a * i - c * g, -(a * f - c * d), C, -(a * h - b * g), a * e - b * d].map((v) => v / det) };
}

function readGltf(json, bins, file) {
  const acc = (i) => {
    const a = json.accessors[i], bv = json.bufferViews[a.bufferView], buf = bins[bv.buffer];
    const n = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type], size = { 5126: 4, 5125: 4, 5123: 2, 5121: 1 }[a.componentType];
    const stride = bv.byteStride || n * size, base = (bv.byteOffset || 0) + (a.byteOffset || 0), out = [];
    const rd = { 5126: (o) => buf.readFloatLE(o), 5125: (o) => buf.readUInt32LE(o), 5123: (o) => buf.readUInt16LE(o), 5121: (o) => buf[o] }[a.componentType];
    for (let k = 0; k < a.count; k++) { const v = []; for (let j = 0; j < n; j++) v.push(rd(base + k * stride + j * size)); out.push(v); }
    return out;
  };
  const cache = [];
  const image = (k) => cache[k] || (cache[k] = (() => {
    const im = json.images[k];
    try {
      if (im.bufferView !== undefined) { const bv = json.bufferViews[im.bufferView]; return png(bins[bv.buffer].subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength)); }
      return png(file(im.uri));
    } catch (e) { throw new Error(`image ${im.uri || im.bufferView}: ${e.message}`); }
  })());
  const colourOf = (matIndex, uv) => {
    const pm = json.materials?.[matIndex]?.pbrMetallicRoughness || {};
    const f = pm.baseColorFactor || [1, 1, 1, 1];
    // The factor is used as a display colour, not as a linear value: then Kenney models match the Kenney previews.
    let t = [255, 255, 255];
    if (pm.baseColorTexture && uv) {
      const img = image(json.textures[pm.baseColorTexture.index].source);
      const fx = uv[0] - Math.floor(uv[0]), fy = uv[1] - Math.floor(uv[1]);
      t = img.rgb(Math.min(img.w - 1, Math.floor(fx * img.w)), Math.min(img.h - 1, Math.floor(fy * img.h)));
    }
    return [0, 1, 2].map((i) => Math.round(Math.min(1, Math.max(0, f[i])) * t[i]));
  };
  const tris = [];
  const visit = (ni, parent) => {
    const node = json.nodes[ni], m = mul(parent, mat4(node));
    if (node.mesh !== undefined) {
      const { det, n: nm } = normalMat(m);
      for (const pr of json.meshes[node.mesh].primitives) {
        if ((pr.mode ?? 4) !== 4) continue;
        const P = acc(pr.attributes.POSITION), N = pr.attributes.NORMAL !== undefined ? acc(pr.attributes.NORMAL) : null;
        const T = pr.attributes.TEXCOORD_0 !== undefined ? acc(pr.attributes.TEXCOORD_0) : null;
        const I = pr.indices !== undefined ? acc(pr.indices).map((v) => v[0]) : P.map((_, k) => k);
        for (let k = 0; k + 2 < I.length; k += 3) {
          const ids = det < 0 ? [I[k], I[k + 2], I[k + 1]] : [I[k], I[k + 1], I[k + 2]];
          const v = ids.map((q) => {
            const [x, y, z] = P[q];
            const p = [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
            let nn = null;
            if (N) { const [a, b, c] = N[q]; nn = [nm[0] * a + nm[3] * b + nm[6] * c, nm[1] * a + nm[4] * b + nm[7] * c, nm[2] * a + nm[5] * b + nm[8] * c]; }
            return { p, n: nn };
          });
          const uv = T ? [0, 1].map((j) => ids.reduce((s, q) => s + T[q][j], 0) / 3) : null;
          tris.push({ v, color: colourOf(pr.material, uv) });
        }
      }
    }
    for (const c of node.children || []) visit(c, m);
  };
  const I4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  for (const ni of json.scenes[json.scene || 0].nodes) visit(ni, I4);
  return tris;
}

function readGlb(buf, file) {
  const jl = buf.readUInt32LE(12), json = JSON.parse(buf.subarray(20, 20 + jl).toString('utf8'));
  const bin = buf.subarray(28 + jl, 28 + jl + buf.readUInt32LE(20 + jl));
  return readGltf(json, [bin], file);
}

// ---- colours: merge the nearest colours until at most maxColors stay
function cluster(tris, maxColors) {
  const bins = new Map();
  for (const t of tris) {
    const key = t.color.map((c) => c >> 3).join(',');
    let b = bins.get(key);
    if (!b) bins.set(key, (b = { sum: [0, 0, 0], n: 0, members: [] }));
    b.sum = b.sum.map((s, i) => s + t.color[i]); b.n++; b.members.push(t);
  }
  const g = [...bins.values()];
  const mean = (b) => b.sum.map((s) => s / b.n);
  while (g.length > maxColors) {
    let best = [0, 1], bd = Infinity;
    for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) {
      const a = mean(g[i]), b = mean(g[j]);
      const d = ((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2) * g[i].n * g[j].n / (g[i].n + g[j].n);
      if (d < bd) { bd = d; best = [i, j]; }
    }
    const [i, j] = best;
    g[i] = { sum: g[i].sum.map((s, k) => s + g[j].sum[k]), n: g[i].n + g[j].n, members: g[i].members.concat(g[j].members) };
    g.splice(j, 1);
  }
  return g.sort((a, b) => b.n - a.n).map((b) => ({ color: '#' + mean(b).map((c) => Math.round(c).toString(16).padStart(2, '0')).join(''), tris: b.members }));
}

// ---- convert one asset
function convert(a, tris) {
  if (tris.length > MAX_TRIS) throw new Error(`${a.id}: ${tris.length} triangles (more than ${MAX_TRIS})`);
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const t of tris) for (const { p } of t.v) for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], p[i]); hi[i] = Math.max(hi[i], p[i]); }
  const ext = hi.map((h, i) => h - lo[i]);
  // fit: target metres per axis; an axis without a target uses the mean factor of the others. No fit: the source is in metres.
  const fit = a.fit || [null, null, null], given = fit.map((f, i) => (f ? f / ext[i] : null)).filter((f) => f);
  const mean = given.length ? given.reduce((s, f) => s + f, 0) / given.length : 1;
  const k = fit.map((f, i) => (f ? f / ext[i] : mean));
  const centre = [(lo[0] + hi[0]) / 2, lo[1], (lo[2] + hi[2]) / 2];
  const groups = cluster(tris, a.maxColors || 4);
  const verts = groups.map((g) => g.tris.flatMap((t) => {
    const p = t.v.map(({ p }) => p.map((c, i) => (c - centre[i]) * k[i]));
    const face = (() => { const u = [0, 1, 2].map((i) => p[1][i] - p[0][i]), w = [0, 1, 2].map((i) => p[2][i] - p[0][i]); return [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]]; })();
    return t.v.map(({ n }, j) => {
      let nn = n ? n.map((c, i) => c / k[i]) : face;
      const l = Math.hypot(...nn) || 1; nn = nn.map((c) => c / l);
      return [...p[j], ...nn];
    });
  }));
  const size = ext.map((e, i) => Math.round(e * k[i] * 1000) / 1000);
  const S = Math.max(...size.map((s) => s)) / 32767 * 1.01;
  const head = Buffer.alloc(12 + 4 * groups.length);
  head.writeUInt32LE(0x314d4254, 0); head.writeUInt32LE(groups.length, 4); head.writeFloatLE(S, 8);
  verts.forEach((v, i) => head.writeUInt32LE(v.length, 12 + 4 * i));
  const body = Buffer.alloc(verts.reduce((s, v) => s + v.length, 0) * 12);
  let o = 0;
  for (const v of verts) for (const x of v) { for (let i = 0; i < 6; i++) { body.writeInt16LE(Math.round(i < 3 ? x[i] / S : x[i] * 32767), o); o += 2; } }
  // slots: { name: "#rrggbb" } gives the name to the group with the nearest colour.
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const slots = {};
  for (const [name, hex] of Object.entries(a.slots || {})) {
    const d = groups.map((g) => rgb(g.color).reduce((s, c, i) => s + (c - rgb(hex)[i]) ** 2, 0));
    slots[d.indexOf(Math.min(...d))] = name;
  }
  const entry = {
    id: a.id, name: a.name, kind: a.kind, license: 'CC0', source: a.page, author: a.author, size,
    mesh: `models/${a.id}.bin`,
    groups: groups.map((g, i) => ({ color: g.color, ...(slots[i] ? { slot: slots[i] } : {}), tris: g.tris.length })),
  };
  if (a.tags?.length) entry.tags = a.tags;
  return { entry, bin: Buffer.concat([head, body]) };
}

// ---- sources
async function kenney(a, cache) {
  const html = await pageWithCC0(a.page);
  const kit = a.page.split('/').pop(), zipFile = join(cache, 'kenney', `${kit}.zip`);
  let zip;
  if (existsSync(zipFile)) zip = readFileSync(zipFile);
  else {
    const link = html.match(/https:\/\/kenney\.nl\/download\/[^'"]+/)?.[0];
    if (!link) throw new Error(`${a.page}: no download link`);
    zip = await fetchBuf(link.replace(/&amp;/g, '&'), zipFile);
  }
  const dir = a.file.slice(0, a.file.lastIndexOf('/') + 1);
  const download = `${a.page} (the download button gives ${kit}.zip, file ${a.file})`;
  return { tris: readGlb(unzip(zip, a.file), (uri) => unzip(zip, dir + decodeURIComponent(uri))), download };
}

async function polyhaven(a, cache) {
  await pageWithCC0(a.page);
  const files = JSON.parse(await fetchBuf(`https://api.polyhaven.com/files/${a.asset}`));
  const g = files.gltf['1k'].gltf, dir = join(cache, 'polyhaven', a.asset);
  const json = JSON.parse(await fetchBuf(g.url, join(dir, 'model.gltf')));
  const bins = await Promise.all(json.buffers.map((b) => fetchBuf(g.include[b.uri].url, join(dir, b.uri))));
  // The engine draws flat colours: the diffuse PNG (same pixels as the JPEG in the glTF) gives them.
  const diff = await fetchBuf(files.Diffuse['1k'].png.url, join(dir, 'diffuse.png'));
  const file = (uri) => { if (/_diff_/.test(uri)) return diff; throw new Error(`no colour data for ${uri}`); };
  return { tris: readGltf(json, bins, file), download: g.url };
}

async function main() {
  const ci = process.argv.indexOf('--cache');
  const cache = ci > 0 ? process.argv[ci + 1] : '/tmp/toybox-assets/cache';
  const src = JSON.parse(readFileSync(join(here, 'sources.json'), 'utf8'));
  mkdirSync(join(ASSETS, 'models'), { recursive: true });
  const entries = [], rows = [];
  for (const a of src.assets) {
    const { tris, download } = await (a.from === 'kenney' ? kenney : polyhaven)(a, cache);
    const { entry, bin } = convert(a, tris);
    writeFileSync(join(ASSETS, entry.mesh), bin);
    entries.push(entry);
    rows.push(`| ${a.id} | ${a.title} | ${a.author} | ${a.page} | ${download} | CC0 1.0 | ${src.checked} | ${a.evidence.replace(/\|/g, '/')} |`);
    console.log(`${a.id}: ${tris.length} triangles, ${entry.groups.length} colours, size ${entry.size.join(' x ')} m, ${bin.length} bytes`);
  }
  writeFileSync(join(ASSETS, 'models', 'index.json'), JSON.stringify(entries, null, 1) + '\n');
  writeFileSync(join(ASSETS, 'ATTRIBUTION.md'), `# Attribution

Toybox uses these third-party models. Each one is CC0 1.0 (https://creativecommons.org/publicdomain/zero/1.0/).
CC0 does not require credit. We give credit to thank the authors.
tools/assets/import.mjs makes this file from tools/assets/sources.json. Do not edit it by hand.

| id | title | author | source page | download | licence | checked | licence evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
${rows.join('\n')}
`);
  writeCatalogue();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
