// Imports the curated CC0 models in tools/assets/sources.json (Kenney and Poly Haven) into Toybox.
// For each asset it checks that the source page states CC0, downloads the files (or reads them from
// the cache), flattens the node transforms, groups the triangles by base colour, scales to metres
// with the base at y=0, and writes assets/models/<id>.bin. Then it writes assets/models/index.json,
// assets/ATTRIBUTION.md and assets/catalogue.json (through core/kit.ts).
// Run: bun tools/assets/import.ts [--cache /tmp/toybox-assets/cache]
//
// Mesh file (little-endian): u32 magic "TBM1", u32 group count G, f32 position scale S,
// G x u32 vertex count, then for each group and each vertex 6 x i16: x, y, z (times S gives metres)
// and nx, ny, nz (divided by 32767). Three vertices make one triangle. Group i has the colour
// groups[i] in the catalogue entry.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { inflateRawSync, inflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { writeCatalogue } from '../../core/kit.ts';
import { isRecord } from '../../web/dom.js';
import { assert } from '../../core/assert.ts';

const here = dirname(fileURLToPath(import.meta.url));
const ASSETS = join(here, '..', '..', 'assets');
const MAX_TRIS = 8000;   // keeps one colour group well inside the 4 MB engine upload buffer
const CC0 = 'creativecommons.org/publicdomain/zero/1.0';
const UA = { 'user-agent': 'Toybox asset import (CC0 models)' };

// ---- types
type Vec3 = [number, number, number];
type Vec4 = [number, number, number, number];
type Mat3 = [number, number, number, number, number, number, number, number, number];
type Mat4 = [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number];
type Axis = 0 | 1 | 2;
const AXES: readonly Axis[] = [0, 1, 2];
const per = (f: (i: Axis) => number): Vec3 => {
  assert(typeof f === 'function');
  return [f(0), f(1), f(2)];
};
const isMat4 = (a: number[]): a is Mat4 => {
  assert(typeof a === 'object');
  assert(a.length < 1e7);
  return a.length === 16;
};
// An element of a list that must exist; throws on a bad index in outside data.
function at<T>(a: readonly T[] | undefined, i: number, what = 'list'): T {
  assert(typeof i === 'number');
  assert(!Number.isNaN(i));
  const v = a?.[i];
  if (v === undefined) throw new Error(`${what}: no entry ${i}`);
  return v;
}

// tools/assets/sources.json
interface SourceBase {
  id: string; name: string; kind: string; tags?: string[]; page: string; title: string; author: string; evidence: string;
  fit?: (number | null)[]; maxColors?: number; slots?: Record<string, string>; base?: number[]; baseNote?: string;
}
interface KenneySource extends SourceBase { from: 'kenney'; file: string }
interface PolySource extends SourceBase { from: 'polyhaven'; asset: string }
type Source = KenneySource | PolySource;
interface Sources { checked: string; assets: Source[] }

const isStr = (v: unknown): v is string => {
  return typeof v === 'string';
};
const isNums = (v: unknown): v is number[] => {
  return Array.isArray(v) && v.every((x) => typeof x === 'number');
};
function isSource(v: unknown): v is Source {
  if (!isRecord(v)) return false;
  if (![v.id, v.name, v.kind, v.page, v.title, v.author, v.evidence].every(isStr)) return false;
  if (v.tags !== undefined && !(Array.isArray(v.tags) && v.tags.every(isStr))) return false;
  if (v.fit !== undefined && !(Array.isArray(v.fit) && v.fit.every((f) => f === null || typeof f === 'number'))) return false;
  if (v.maxColors !== undefined && typeof v.maxColors !== 'number') return false;
  if (v.slots !== undefined && !(isRecord(v.slots) && Object.values(v.slots).every(isStr))) return false;
  if (v.base !== undefined && !isNums(v.base)) return false;
  return v.from === 'kenney' ? isStr(v.file) : v.from === 'polyhaven' && isStr(v.asset);
}
function parseSources(text: string): Sources {
  assert(typeof text === 'string');
  assert(text.length < 1e7);
  const v: unknown = JSON.parse(text);
  if (!isRecord(v) || !isStr(v.checked) || !Array.isArray(v.assets)) throw new Error('sources.json: bad shape');
  const assets: Source[] = [];
  for (const a of v.assets) {
    if (!isSource(a)) throw new Error(`sources.json: bad asset ${isRecord(a) ? String(a.id) : String(a)}`);
    assets.push(a);
  }
  return { checked: v.checked, assets };
}

// The Poly Haven files API: the 1k glTF, the files it includes, and the 1k diffuse PNG
interface PolyFiles { gltfUrl: string; include: Record<string, string>; diffuse: string }
const isUrlHolder = (v: unknown): v is { url: string } => {
  return isRecord(v) && isStr(v.url);
};
function parsePolyFiles(v: unknown): PolyFiles {
  if (isRecord(v)) {
    const gl = isRecord(v.gltf) ? v.gltf['1k'] : undefined, df = isRecord(v.Diffuse) ? v.Diffuse['1k'] : undefined;
    const g = isRecord(gl) ? gl.gltf : undefined, d = isRecord(df) ? df.png : undefined;
    if (isRecord(g) && isStr(g.url) && isRecord(g.include) && isUrlHolder(d)) {
      const include: Record<string, string> = {};
      for (const [k, u] of Object.entries(g.include)) if (isUrlHolder(u)) include[k] = u.url;
      return { gltfUrl: g.url, include, diffuse: d.url };
    }
  }
  throw new Error('unexpected Poly Haven files response');
}

// glTF (the fields this tool reads)
interface GltfNode { matrix?: Mat4; rotation?: Vec4; scale?: Vec3; translation?: Vec3; mesh?: number; children?: number[] }
interface GltfPrimitive { mode?: number; attributes: { POSITION: number; NORMAL?: number; TEXCOORD_0?: number }; indices?: number; material?: number }
interface GltfAccessor { bufferView: number; byteOffset?: number; componentType: number; count: number; type: string }
interface GltfBufferView { buffer: number; byteOffset?: number; byteLength: number; byteStride?: number }
interface GltfMaterial { pbrMetallicRoughness?: { baseColorFactor?: number[]; baseColorTexture?: { index: number } } }
interface GltfImage { uri?: string; bufferView?: number }
interface Gltf {
  accessors: GltfAccessor[]; bufferViews: GltfBufferView[]; nodes: GltfNode[]; meshes: { primitives: GltfPrimitive[] }[];
  scenes: { nodes: number[] }[]; scene?: number; materials?: GltfMaterial[]; textures?: { source: number }[]; images?: GltfImage[];
  buffers?: { uri: string }[];
}
// Checks the top-level lists; entries are read through at(), which throws on a missing one.
function isGltf(v: unknown): v is Gltf {
  return isRecord(v) && [v.accessors, v.bufferViews, v.nodes, v.meshes, v.scenes].every(Array.isArray)
    && [v.materials, v.textures, v.images, v.buffers].every((x) => {
      return x === undefined || Array.isArray(x);
    });
}
function parseGltf(v: unknown): Gltf {
  if (!isGltf(v)) throw new Error('not a glTF document');
  return v;
}

interface Png { w: number; h: number; rgb(x: number, y: number): Vec3 }
interface TriVert { p: Vec3; n: Vec3 | null }
interface Tri { v: [TriVert, TriVert, TriVert]; color: Vec3 }
interface Cluster { sum: Vec3; n: number; members: Tri[] }
interface Group { color: string; tris: Tri[] }
type Vert = [number, number, number, number, number, number];
interface ModelEntry {
  id: string; name: string; kind: string; license: string; source: string; author: string; size: Vec3; mesh: string;
  groups: { color: string; slot?: string; tris: number }[]; tags?: string[]; base?: number[];
}

// ---- download with a file cache
async function fetchBuf(url: string, cacheFile?: string): Promise<Buffer> {
  assert(typeof url === 'string');
  assert(url.length < 1e7);
  if (cacheFile && existsSync(cacheFile)) return readFileSync(cacheFile);
  const r = await fetch(url, { headers: UA });
  if (!r.ok) throw new Error(`${r.status} for ${url}`);
  const b = Buffer.from(await r.arrayBuffer());
  if (cacheFile) { mkdirSync(dirname(cacheFile), { recursive: true }); writeFileSync(cacheFile, b); }
  return b;
}
async function pageWithCC0(url: string): Promise<string> {
  // A query string skips the page cache: Kenney download links in a cached page can be expired.
  assert(typeof url === 'string');
  assert(url.length < 1e7);
  const html = (await fetchBuf(`${url}?t=${Date.now()}`)).toString('utf8');
  if (!html.includes(CC0)) throw new Error(`${url} does not state CC0`);
  return html;
}

// ---- zip (Kenney kits): read one entry
function unzip(zip: Buffer, suffix: string): Buffer {
  assert(typeof zip === 'object');
  assert(typeof suffix === 'string');
  assert(suffix.length < 1e7);
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
const PNG_CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
function png(buf: Buffer): Png {
  assert(typeof buf === 'object');
  let p = 8, w = 0, h = 0, depth = 0, type = 0, pal: Buffer = Buffer.alloc(0); const idat: Buffer[] = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), t = buf.toString('ascii', p + 4, p + 8), d = buf.subarray(p + 8, p + 8 + len);
    if (t === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); depth = d.readUInt8(8); type = d.readUInt8(9); if (d.readUInt8(12)) throw new Error('interlaced PNG'); }
    else if (t === 'PLTE') pal = d; else if (t === 'IDAT') idat.push(d); else if (t === 'IEND') break;
    p += 12 + len;
  }
  if (depth !== 8 && depth !== 16) throw new Error(`PNG bit depth ${depth}`);
  const channels = PNG_CHANNELS[type];
  if (channels === undefined) throw new Error(`PNG colour type ${type}`);
  const ch = depth / 8, bpp = channels * ch, stride = w * bpp, raw = inflateSync(Buffer.concat(idat));
  const px = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, o = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[o + x - bpp] ?? 0 : 0, b = y ? px[o - stride + x] ?? 0 : 0, c = x >= bpp && y ? px[o - stride + x - bpp] ?? 0 : 0;
      let v = raw[src + x] ?? 0;
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      px[o + x] = v & 255;
    }
  }
  const px8 = (i: number): number => {
    assert(typeof i === 'number');
    assert(!Number.isNaN(i));
    const returned = px[i] ?? 0;
    assert(typeof returned === 'number');
    return returned;
  }, pal8 = (i: number): number => {
    assert(typeof i === 'number');
    assert(!Number.isNaN(i));
    const returned = pal[i] ?? 0;
    assert(typeof returned === 'number');
    return returned;
  };
  return {
    w, h, rgb(x: number, y: number): Vec3 {
      assert(typeof stride === 'number');
      assert(typeof bpp === 'number');
      assert(typeof pal8 === 'function');
      assert(typeof x === 'number');
      assert(typeof y === 'number');
      assert(!Number.isNaN(x));
      assert(!Number.isNaN(y));
      const i = y * stride + x * bpp;
      if (type === 3) return [pal8(px8(i) * 3), pal8(px8(i) * 3 + 1), pal8(px8(i) * 3 + 2)];
      if (type === 0 || type === 4) return [px8(i), px8(i), px8(i)];
      return [px8(i), px8(i + ch), px8(i + 2 * ch)];   // the high byte of a 16-bit sample comes first
    },
  };
}

// ---- glTF: flatten every triangle of the default scene to world space with a colour
function mat4(n: GltfNode): Mat4 {
  assert(typeof n === 'object');
  if (n.matrix) return n.matrix;
  const [x, y, z, w] = n.rotation || [0, 0, 0, 1], [sx, sy, sz] = n.scale || [1, 1, 1], [tx, ty, tz] = n.translation || [0, 0, 0];
  return [(1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0, tx, ty, tz, 1];
}
const mul = (a: Mat4, b: Mat4): Mat4 => {
  assert(typeof a === 'object');
  assert(typeof b === 'object');
  assert(a.length < 1e7);
  assert(b.length < 1e7);
  const o: number[] = [];
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += (a[k * 4 + r] ?? 0) * (b[c * 4 + k] ?? 0); o.push(s); }
  if (!isMat4(o)) throw new Error('mul: bad matrix');
  return o;
};
function normalMat(m: Mat4): { det: number; n: Mat3 } {   // inverse transpose of the upper 3x3, column-major
  assert(typeof m === 'object');
  assert(m.length < 1e7);
  const [a, b, c, d, e, f, g, h, i] = [m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]];
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, det = a * A + b * B + c * C;
  const q = (v: number): number => {
    assert(typeof v === 'number');
    assert(!Number.isNaN(v));
    const returned = v / det;
    assert(typeof returned === 'number');
    return returned;
  };
  return { det, n: [q(A), q(-(b * i - c * h)), q(b * f - c * e), q(B), q(a * i - c * g), q(-(a * f - c * d)), q(C), q(-(a * h - b * g)), q(a * e - b * d)] };
}

const GLTF_COMPONENTS: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
const GLTF_BYTES: Record<number, number> = { 5126: 4, 5125: 4, 5123: 2, 5121: 1 };
function reader(componentType: number, buf: Buffer): (o: number) => number {
  assert(typeof componentType === 'number');
  assert(typeof buf === 'object');
  assert(!Number.isNaN(componentType));
  if (componentType === 5126) return (o) => {
    assert(typeof o === 'number');
    assert(!Number.isNaN(o));
    const returned = buf.readFloatLE(o);
    assert(typeof returned === 'number');
    return returned;
  };
  if (componentType === 5125) return (o) => {
    assert(typeof o === 'number');
    assert(!Number.isNaN(o));
    const returned = buf.readUInt32LE(o);
    assert(typeof returned === 'number');
    return returned;
  };
  if (componentType === 5123) return (o) => {
    assert(typeof o === 'number');
    assert(!Number.isNaN(o));
    const returned = buf.readUInt16LE(o);
    assert(typeof returned === 'number');
    return returned;
  };
  if (componentType === 5121) return (o) => {
    assert(typeof o === 'number');
    assert(!Number.isNaN(o));
    const returned = buf.readUInt8(o);
    assert(typeof returned === 'number');
    return returned;
  };
  throw new Error(`glTF component type ${componentType}`);
}
function vec3Of(row: number[], what: string): Vec3 {
  assert(typeof row === 'object');
  assert(typeof what === 'string');
  assert(row.length < 1e7);
  assert(what.length < 1e7);
  const [x, y, z] = row;
  if (x === undefined || y === undefined || z === undefined) throw new Error(`${what}: not a vec3`);
  return [x, y, z];
}

// The vectors and numbers of the accessors of a glTF file.
interface Readers { accV3: (i: number) => Vec3[]; accV2: (i: number) => [number, number][]; accScalar: (i: number) => number[] }
function accessorReaders(json: Gltf, bins: Buffer[]): Readers {
  assert(typeof json === 'object');
  assert(typeof bins === 'object');
  assert(bins.length < 1e7);
  const acc = (i: number): number[][] => {
    assert(typeof json === 'object');
    assert(typeof bins === 'object');
    assert(typeof GLTF_COMPONENTS === 'object');
    assert(bins.length < 1e7);
    assert(typeof i === 'number');
    assert(!Number.isNaN(i));
    const a = at(json.accessors, i, 'accessors'), bv = at(json.bufferViews, a.bufferView, 'bufferViews'), buf = at(bins, bv.buffer, 'buffers');
    const n = GLTF_COMPONENTS[a.type], size = GLTF_BYTES[a.componentType];
    if (n === undefined || size === undefined) throw new Error(`glTF accessor ${i}: ${a.type} ${a.componentType}`);
    const stride = bv.byteStride || n * size, base = (bv.byteOffset || 0) + (a.byteOffset || 0), out: number[][] = [];
    const rd = reader(a.componentType, buf);
    for (let k = 0; k < a.count; k++) { const v: number[] = []; for (let j = 0; j < n; j++) v.push(rd(base + k * stride + j * size)); out.push(v); }
    return out;
  };
  const accV3 = (i: number): Vec3[] => {
    assert(typeof i === 'number');
    assert(!Number.isNaN(i));
    return acc(i).map((row) => {
    assert(typeof row === 'object');
    assert(row.length < 1e7);
    return vec3Of(row, `accessor ${i}`);
  });
  };
  const accV2 = (i: number): [number, number][] => {
    assert(typeof i === 'number');
    assert(!Number.isNaN(i));
    return acc(i).map((row) => {
    assert(typeof row === 'object');
    assert(row.length < 1e7);
    const [u, v] = row;
    if (u === undefined || v === undefined) throw new Error(`accessor ${i}: not a vec2`);
    return [u, v];
  });
  };
  const accScalar = (i: number): number[] => {
    assert(typeof i === 'number');
    assert(!Number.isNaN(i));
    return acc(i).map((row) => {
    assert(typeof row === 'object');
    assert(row.length < 1e7);
    const returned = at(row, 0, `accessor ${i}`);
    assert(typeof returned === 'number');
    return returned;
  });
  };
  return { accV3, accV2, accScalar };
}

// The colour of a material at a texture coordinate. Returns the function that finds it.
function colourReader(json: Gltf, bins: Buffer[], file: (uri: string) => Buffer): (matIndex: number | undefined, uv: [number, number] | null) => Vec3 {
  assert(typeof json === 'object');
  assert(typeof bins === 'object');
  assert(typeof file === 'function');
  assert(bins.length < 1e7);
  const cache: (Png | undefined)[] = [];
  const image = (k: number): Png => {
    assert(typeof cache === 'object');
    assert(typeof json === 'object');
    assert(typeof bins === 'object');
    assert(cache.length < 1e7);
    assert(bins.length < 1e7);
    assert(typeof k === 'number');
    assert(!Number.isNaN(k));
    return cache[k] || (cache[k] = (() => {
    assert(typeof json === 'object');
    assert(typeof k === 'number');
    assert(typeof bins === 'object');
    assert(!Number.isNaN(k));
    assert(bins.length < 1e7);
    const im = at(json.images, k, 'images');
    try {
      if (im.bufferView !== undefined) { const bv = at(json.bufferViews, im.bufferView, 'bufferViews'); return png(at(bins, bv.buffer, 'buffers').subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength)); }
      if (im.uri === undefined) throw new Error('image without uri or bufferView');
      return png(file(im.uri));
    } catch (e) { throw new Error(`image ${im.uri || im.bufferView}: ${e instanceof Error ? e.message : String(e)}`); }
  })());
  };
  const colourOf = (matIndex: number | undefined, uv: [number, number] | null): Vec3 => {
    const pm = (matIndex === undefined ? undefined : json.materials?.[matIndex])?.pbrMetallicRoughness || {};
    const f = pm.baseColorFactor || [1, 1, 1, 1];
    // The factor is used as a display colour, not as a linear value: then Kenney models match the Kenney previews.
    let t: Vec3 = [255, 255, 255];
    if (pm.baseColorTexture && uv) {
      const img = image(at(json.textures, pm.baseColorTexture.index, 'textures').source);
      const fx = uv[0] - Math.floor(uv[0]), fy = uv[1] - Math.floor(uv[1]);
      t = img.rgb(Math.min(img.w - 1, Math.floor(fx * img.w)), Math.min(img.h - 1, Math.floor(fy * img.h)));
    }
    return per((i) => {
      assert(typeof i === 'number');
      assert(!Number.isNaN(i));
      const returned = Math.round(Math.min(1, Math.max(0, f[i] ?? 1)) * t[i]);
      assert(typeof returned === 'number');
      return returned;
    });
  };
  return colourOf;
}

function readGltf(json: Gltf, bins: Buffer[], file: (uri: string) => Buffer): Tri[] {
  assert(typeof json === 'object');
  assert(typeof bins === 'object');
  assert(typeof file === 'function');
  assert(bins.length < 1e7);
  const { accV3, accV2, accScalar } = accessorReaders(json, bins);
  const colourOf = colourReader(json, bins, file);
  const tris: Tri[] = [];
  const visit = (ni: number, parent: Mat4): [number, Mat4][] => {
    assert(typeof json === 'object');
    assert(typeof mul === 'function');
    assert(typeof tris === 'object');
    assert(typeof ni === 'number');
    assert(typeof parent === 'object');
    assert(!Number.isNaN(ni));
    assert(parent.length < 1e7);
    const node = at(json.nodes, ni, 'nodes'), m = mul(parent, mat4(node));
    if (node.mesh !== undefined) {
      const { det, n: nm } = normalMat(m);
      for (const pr of at(json.meshes, node.mesh, 'meshes').primitives) {
        if ((pr.mode ?? 4) !== 4) continue;
        const P = accV3(pr.attributes.POSITION), N = pr.attributes.NORMAL !== undefined ? accV3(pr.attributes.NORMAL) : null;
        const T = pr.attributes.TEXCOORD_0 !== undefined ? accV2(pr.attributes.TEXCOORD_0) : null;
        const I = pr.indices !== undefined ? accScalar(pr.indices) : P.map((_, k) => k);
        for (let k = 0; k + 2 < I.length; k += 3) {
          const i0 = at(I, k), i1 = at(I, k + 1), i2 = at(I, k + 2);
          const ids: Vec3 = det < 0 ? [i0, i2, i1] : [i0, i1, i2];
          const vert = (q: number): TriVert => {
            assert(typeof q === 'number');
            assert(!Number.isNaN(q));
            const [x, y, z] = at(P, q, 'positions');
            const p: Vec3 = [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
            let nn: Vec3 | null = null;
            if (N) { const [a, b, c] = at(N, q, 'normals'); nn = [nm[0] * a + nm[3] * b + nm[6] * c, nm[1] * a + nm[4] * b + nm[7] * c, nm[2] * a + nm[5] * b + nm[8] * c]; }
            return { p, n: nn };
          };
          const v: [TriVert, TriVert, TriVert] = [vert(ids[0]), vert(ids[1]), vert(ids[2])];
          const uvAvg = (j: 0 | 1): number => ids.reduce((s, q) => {
            assert(typeof s === 'number');
            assert(typeof q === 'number');
            assert(!Number.isNaN(s));
            assert(!Number.isNaN(q));
            const returned = s + at(T ?? undefined, q, 'texcoords')[j];
            assert(typeof returned === 'number');
            return returned;
          }, 0) / 3;
          const uv: [number, number] | null = T ? [uvAvg(0), uvAvg(1)] : null;
          tris.push({ v, color: colourOf(pr.material, uv) });
        }
      }
    }
    return (node.children || []).map((c): [number, Mat4] => [c, m]);
  };
  const I4: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const pending = at(json.scenes, json.scene || 0, 'scenes').nodes.map((ni): [number, Mat4] => [ni, I4]).reverse();
  for (let job = pending.pop(); job !== undefined; job = pending.pop()) pending.push(...visit(job[0], job[1]).reverse());
  return tris;
}

function readGlb(buf: Buffer, file: (uri: string) => Buffer): Tri[] {
  assert(typeof buf === 'object');
  assert(typeof file === 'function');
  const jl = buf.readUInt32LE(12), json = parseGltf(JSON.parse(buf.subarray(20, 20 + jl).toString('utf8')));
  const bin = buf.subarray(28 + jl, 28 + jl + buf.readUInt32LE(20 + jl));
  return readGltf(json, [bin], file);
}

// ---- colours: merge the nearest colours until at most maxColors stay
function cluster(tris: Tri[], maxColors: number): Group[] {
  assert(typeof tris === 'object');
  assert(typeof maxColors === 'number');
  assert(tris.length < 1e7);
  assert(!Number.isNaN(maxColors));
  const bins = new Map<string, Cluster>();
  for (const t of tris) {
    const key = t.color.map((c) => {
      assert(typeof c === 'number');
      assert(!Number.isNaN(c));
      const returned = c >> 3;
      assert(typeof returned === 'number');
      return returned;
    }).join(',');
    let b = bins.get(key);
    if (!b) bins.set(key, (b = { sum: [0, 0, 0], n: 0, members: [] }));
    b.sum = per((i) => {
      assert(typeof i === 'number');
      assert(!Number.isNaN(i));
      const returned = (b ? b.sum[i] : 0) + t.color[i];
      assert(typeof returned === 'number');
      return returned;
    }); b.n++; b.members.push(t);
  }
  const g = [...bins.values()];
  const mean = (b: Cluster): Vec3 => per((i) => {
    assert(typeof i === 'number');
    assert(!Number.isNaN(i));
    const returned = b.sum[i] / b.n;
    assert(typeof returned === 'number');
    return returned;
  });
  while (g.length > maxColors) {
    let best: [number, number] = [0, 1], bd = Infinity;
    for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) {
      const gi = at(g, i), gj = at(g, j);
      const a = mean(gi), b = mean(gj);
      const d = ((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2) * gi.n * gj.n / (gi.n + gj.n);
      if (d < bd) { bd = d; best = [i, j]; }
    }
    const [i, j] = best, gi = at(g, i), gj = at(g, j);
    g[i] = { sum: per((k) => {
      assert(typeof k === 'number');
      assert(!Number.isNaN(k));
      const returned = gi.sum[k] + gj.sum[k];
      assert(typeof returned === 'number');
      return returned;
    }), n: gi.n + gj.n, members: gi.members.concat(gj.members) };
    g.splice(j, 1);
  }
  return g.sort((a, b) => b.n - a.n).map((b) => ({ color: '#' + mean(b).map((c) => Math.round(c).toString(16).padStart(2, '0')).join(''), tris: b.members }));
}

// ---- convert one asset
function convert(a: Source, tris: Tri[]): { entry: ModelEntry; bin: Buffer } {
  assert(typeof a === 'object');
  assert(typeof tris === 'object');
  assert(tris.length < 1e7);
  if (tris.length > MAX_TRIS) throw new Error(`${a.id}: ${tris.length} triangles (more than ${MAX_TRIS})`);
  const lo: Vec3 = [Infinity, Infinity, Infinity], hi: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const t of tris) for (const { p } of t.v) for (const i of AXES) { lo[i] = Math.min(lo[i], p[i]); hi[i] = Math.max(hi[i], p[i]); }
  const ext = per((i) => hi[i] - lo[i]);
  // fit: target metres per axis; an axis without a target uses the mean factor of the others. No fit: the source is in metres.
  const fit = a.fit || [null, null, null], fitAt = (i: Axis): number | null => fit[i] ?? null;
  const given = AXES.map((i) => { const f = fitAt(i); return f ? f / ext[i] : null; }).filter((f): f is number => f !== null);
  const mean = given.length ? given.reduce((s, f) => s + f, 0) / given.length : 1;
  const k = per((i) => { 
    assert(typeof i === 'number');
    assert(!Number.isNaN(i));
    const f = fitAt(i); const returned = f ? f / ext[i] : mean;
  assert(typeof returned === 'number');
  return returned; });
  const centre: Vec3 = [(lo[0] + hi[0]) / 2, lo[1], (lo[2] + hi[2]) / 2];
  const groups = cluster(tris, a.maxColors || 4);
  const verts: Vert[][] = groups.map((g) => g.tris.flatMap((t): Vert[] => {
    const xf = (q: Vec3): Vec3 => per((i) => (q[i] - centre[i]) * k[i]);
    const p: [Vec3, Vec3, Vec3] = [xf(t.v[0].p), xf(t.v[1].p), xf(t.v[2].p)];
    const face = ((): Vec3 => { const u = per((i) => p[1][i] - p[0][i]), w = per((i) => p[2][i] - p[0][i]); return [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]]; })();
    return t.v.map(({ n }, j): Vert => {
      const raw: Vec3 = n ? per((i) => n[i] / k[i]) : face;
      const l = Math.hypot(...raw) || 1, nn = per((i) => raw[i] / l), pj = at(p, j);
      return [pj[0], pj[1], pj[2], nn[0], nn[1], nn[2]];
    });
  }));
  const size = per((i) => Math.round(ext[i] * k[i] * 1000) / 1000);
  const S = Math.max(...size.map((s) => s)) / 32767 * 1.01;
  const head = Buffer.alloc(12 + 4 * groups.length);
  head.writeUInt32LE(0x314d4254, 0); head.writeUInt32LE(groups.length, 4); head.writeFloatLE(S, 8);
  verts.forEach((v, i) => head.writeUInt32LE(v.length, 12 + 4 * i));
  const body = Buffer.alloc(verts.reduce((s, v) => s + v.length, 0) * 12);
  let o = 0;
  for (const v of verts) for (const x of v) { for (let i = 0; i < 6; i++) { const c = x[i] ?? 0; body.writeInt16LE(Math.round(i < 3 ? c / S : c * 32767), o); o += 2; } }
  // slots: { name: "#rrggbb" } gives the name to the group with the nearest colour.
  const rgb = (h: string): Vec3 => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const slots: Record<number, string> = {};
  for (const [name, hex] of Object.entries(a.slots || {})) {
    const hx = rgb(hex);
    const d = groups.map((g) => { 
      assert(typeof g === 'object');
      const gc = rgb(g.color); const returned = (gc[0] - hx[0]) ** 2 + (gc[1] - hx[1]) ** 2 + (gc[2] - hx[2]) ** 2;
    assert(typeof returned === 'number');
    return returned; });
    slots[d.indexOf(Math.min(...d))] = name;
  }
  const entry: ModelEntry = {
    id: a.id, name: a.name, kind: a.kind, license: 'CC0', source: a.page, author: a.author, size,
    mesh: `models/${a.id}.bin`,
    groups: groups.map((g, i) => ({ color: g.color, ...(slots[i] ? { slot: slots[i] } : {}), tris: g.tris.length })),
  };
  if (a.tags?.length) entry.tags = a.tags;
  if (a.base) entry.base = a.base;
  return { entry, bin: Buffer.concat([head, body]) };
}

// ---- sources
interface Fetched { tris: Tri[]; download: string }

async function kenney(a: KenneySource, cache: string): Promise<Fetched> {
  assert(typeof a === 'object');
  assert(typeof cache === 'string');
  assert(cache.length < 1e7);
  const html = await pageWithCC0(a.page);
  const kit = a.page.split('/').pop() ?? '', zipFile = join(cache, 'kenney', `${kit}.zip`);
  let zip: Buffer;
  if (existsSync(zipFile)) zip = readFileSync(zipFile);
  else {
    const link = html.match(/https:\/\/kenney\.nl\/download\/[^'"]+/)?.[0];
    if (!link) throw new Error(`${a.page}: no download link`);
    zip = await fetchBuf(link.replace(/&amp;/g, '&'), zipFile);
  }
  const dir = a.file.slice(0, a.file.lastIndexOf('/') + 1);
  const download = `${a.page} (the download button gives ${kit}.zip, file ${a.file})`;
  return { tris: readGlb(unzip(zip, a.file), (uri) => {
    assert(typeof uri === 'string');
    assert(uri.length < 1e7);
    return unzip(zip, dir + decodeURIComponent(uri));
  }), download };
}

async function polyhaven(a: PolySource, cache: string): Promise<Fetched> {
  assert(typeof a === 'object');
  assert(typeof cache === 'string');
  assert(cache.length < 1e7);
  await pageWithCC0(a.page);
  const files = parsePolyFiles(JSON.parse((await fetchBuf(`https://api.polyhaven.com/files/${a.asset}`)).toString('utf8')));
  const dir = join(cache, 'polyhaven', a.asset);
  const json = parseGltf(JSON.parse((await fetchBuf(files.gltfUrl, join(dir, 'model.gltf'))).toString('utf8')));
  const bins = await Promise.all((json.buffers ?? []).map((b) => {
    assert(typeof files === 'object');
    assert(typeof a === 'object');
    assert(typeof dir === 'string');
    assert(dir.length < 1e7);
    assert(typeof b === 'object');
    const url = files.include[b.uri];
    if (url === undefined) throw new Error(`${a.asset}: no download for ${b.uri}`);
    return fetchBuf(url, join(dir, b.uri));
  }));
  // The engine draws flat colours: the diffuse PNG (same pixels as the JPEG in the glTF) gives them.
  const diff = await fetchBuf(files.diffuse, join(dir, 'diffuse.png'));
  const file = (uri: string): Buffer => { 
    assert(typeof uri === 'string');
    assert(uri.length < 1e7);
    if (/_diff_/.test(uri)) return diff; throw new Error(`no colour data for ${uri}`); };
  return { tris: readGltf(json, bins, file), download: files.gltfUrl };
}

// A bare URL is a Markdown lint error: put each URL in <> so the table stays valid Markdown.
function link(text: string): string { 
  assert(typeof text === 'string');
  assert(text.length < 1e7);
  return text.replace(/(?:https?:\/\/|\bwww\.)[^\s)"]+/g, (u) => {
  assert(typeof u === 'string');
  assert(u.length < 1e7);
  const returned = `<${u.startsWith('www.') ? 'https://' : ''}${u}>`;
  assert(typeof returned === 'string');
  assert(returned.length < 1e7);
  return returned;
}); }

async function main(): Promise<void> {
  assert(typeof here === 'string');
  assert(typeof ASSETS === 'string');
  const ci = process.argv.indexOf('--cache');
  const cacheArg = ci > 0 ? process.argv[ci + 1] : undefined;
  if (ci > 0 && cacheArg === undefined) throw new Error('--cache needs a directory');
  const cache = cacheArg ?? '/tmp/toybox-assets/cache';
  const src = parseSources(readFileSync(join(here, 'sources.json'), 'utf8'));
  mkdirSync(join(ASSETS, 'models'), { recursive: true });
  const entries: ModelEntry[] = [], rows: string[] = [];
  for (const a of src.assets) {
    const { tris, download } = a.from === 'kenney' ? await kenney(a, cache) : await polyhaven(a, cache);
    const { entry, bin } = convert(a, tris);
    writeFileSync(join(ASSETS, entry.mesh), bin);
    entries.push(entry);
    rows.push(`| ${a.id} | ${a.title} | ${link(a.author)} | ${link(a.page)} | ${link(download)} | CC0 1.0 | ${src.checked} | ${link(a.evidence.replace(/\|/g, '/'))} |`);
    console.log(`${a.id}: ${tris.length} triangles, ${entry.groups.length} colours, size ${entry.size.join(' x ')} m, ${bin.length} bytes`);
  }
  writeFileSync(join(ASSETS, 'models', 'index.json'), JSON.stringify(entries, null, 1) + '\n');
  writeFileSync(join(ASSETS, 'ATTRIBUTION.md'), `# Attribution

Toybox uses these third-party models. Each one is CC0 1.0 (<https://creativecommons.org/publicdomain/zero/1.0/>).
CC0 does not require credit. We give credit to thank the authors.
tools/assets/import.ts makes this file from tools/assets/sources.json. Do not edit it by hand.

| id | title | author | source page | download | licence | checked | licence evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
${rows.join('\n')}
`);
  writeCatalogue();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
