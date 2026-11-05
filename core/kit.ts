// Generator for assets/catalogue.json: the Toybox kit, built from box, cylinder, sphere and wedge.
// Run: bun core/kit.ts   (writes assets/catalogue.json)
// It also adds the imported CC0 models in assets/models/index.json (made by tools/assets/import.ts).
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { Vec3, Prim, Part, Model, Outfit } from '../web/types.ts';
import { modelBounds, partBounds } from './geom.ts';
import { assert } from './assert.ts';

const LICENSE = 'CC0 (Toybox kit)';
const C = {
  ink: '#3a3f47', glass: '#8fb0c4', tyre: '#2c2f34', white: '#ece8df', red: '#b5483c', blue: '#4a79a5', navy: '#2f4a6b',
  yellow: '#d9b44a', green: '#6f9a6a', darkgreen: '#4f7a52', concrete: '#bdb7ab', asphalt: '#5d6168', line: '#e7e2d3',
  wood: '#a67c52', cream: '#e8dcc0', teal: '#5f9ea0', pink: '#d9a5a0', sand: '#d8c6a0', steel: '#9aa1a8', dark: '#4a4f57',
  char: '#2e2b2a', ash: '#4b4644', orange: '#d98a3d', grey: '#a9a9a4', brick: '#b8765f', sage: '#9db89a', lilac: '#a99bb8',
  floor: '#cfc7b6', ceil: '#f0ece2', wall: '#e6e0d2', carpet: '#7c8aa5', train: '#d8dcdf', edge: '#d8d2c2',
};
// Parts made here always carry rot and color; Part in web/types.ts has them optional.
interface KitPart extends Part { rot: Vec3; color: string }
interface OutfitPart extends KitPart { bone: string }
// NEED-TYPE: Model in web/types.ts needs parts, but imported models (assets/models/index.json) have a mesh and groups instead.
interface ImportedModel { id: string; name: string; kind: string; license: string; size: Vec3; mesh: string; groups: { color: string; slot?: string; tris: number }[]; tags?: string[]; base?: number[]; [extra: string]: unknown }
interface KitCatalogue { models: (Model | ImportedModel)[]; outfits: Outfit[] }
interface RawModel { id: string; name: string; kind: string; parts: KitPart[]; tags: string[] }
interface CarOpts { body?: string; roof?: string | null; len?: number; w?: number; extra?: KitPart[] }
interface BusOpts { len: number; w: number; h: number; body: string; stripe: string; roofColor: string; wheelZ: number[] }

const r = (v: number): number => Math.round(v * 1000) / 1000;
const v3 = ([a, b, c]: Vec3): Vec3 => [r(a), r(b), r(c)];
// Bounds come back as plain number arrays: take the first three.
const tri = (a: readonly number[]): Vec3 => [a[0] ?? 0, a[1] ?? 0, a[2] ?? 0];
const part = (prim: Prim, pos: Vec3, size: Vec3, color: string, slot?: string | null, rot?: Vec3 | null): KitPart => {
  assert(typeof prim === 'string');
  assert(typeof pos === 'object');
  assert(typeof size === 'object');
  assert(typeof color === 'string');
  assert(prim.length < 1e7);
  assert(pos.length < 1e7);
  assert(size.length < 1e7);
  assert(color.length < 1e7);
  const p: KitPart = { prim, pos: v3(pos), size: v3(size), rot: rot || [0, 0, 0], color };
  if (slot) p.slot = slot;
  return p;
};
const box = (pos: Vec3, size: Vec3, color: string, slot?: string | null, rot?: Vec3 | null): KitPart => {
  assert(typeof size === 'object');
  assert(typeof color === 'string');
  assert(pos.length < 1e7);
  assert(size.length < 1e7);
  assert(typeof pos === 'object');
  return part('box', pos, size, color, slot, rot);
};
const cyl = (pos: Vec3, size: Vec3, color: string, slot?: string | null, rot?: Vec3 | null): KitPart => part('cylinder', pos, size, color, slot, rot);
const sph = (pos: Vec3, size: Vec3, color: string, slot?: string | null): KitPart => part('sphere', pos, size, color, slot);
const wed = (pos: Vec3, size: Vec3, color: string, slot?: string | null, rot?: Vec3 | null): KitPart => part('wedge', pos, size, color, slot, rot);

function wheels(xs: number[], zs: number[], d: number, w: number, y: number = d / 2): KitPart[] {
  assert(typeof xs === 'object');
  assert(typeof zs === 'object');
  assert(typeof d === 'number');
  assert(typeof w === 'number');
  assert(xs.length < 1e7);
  assert(zs.length < 1e7);
  assert(!Number.isNaN(d));
  assert(!Number.isNaN(w));
  const out: KitPart[] = [];
  for (const x of xs) for (const z of zs) out.push(cyl([x, y, z], [d, w, d], C.tyre, 'tyre', [0, 0, 90]));
  return out;
}

function car({ body = C.red, roof = null, len = 4.6, w = 1.8, extra = [] }: CarOpts): KitPart[] {
  const hw = w / 2;
  return [
    box([0, 0.55, 0], [w, 0.6, len], body, 'body'),
    box([0, 1.125, -0.2], [w - 0.25, 0.55, len * 0.52], roof || body, 'body'),
    box([0, 1.15, -0.2], [w - 0.22, 0.4, len * 0.52 - 0.2], C.glass, 'glass'),
    box([0, 1.43, -0.2], [w - 0.3, 0.08, len * 0.5], roof || body, 'body'),
    box([hw - 0.3, 0.6, len / 2 + 0.01], [0.3, 0.14, 0.04], C.yellow),
    box([-hw + 0.3, 0.6, len / 2 + 0.01], [0.3, 0.14, 0.04], C.yellow),
    box([0, 0.35, 0], [w - 0.1, 0.1, len - 0.2], C.dark),
    ...wheels([-hw + 0.1, hw - 0.1], [len / 2 - 0.9, -len / 2 + 0.9], 0.64, 0.22),
    ...extra,
  ];
}

function bus({ len, w, h, body, stripe, roofColor, wheelZ }: BusOpts): KitPart[] {
  const hw = w / 2;
  return [
    box([0, 0.35 + (h - 0.35) / 2, 0], [w, h - 0.35, len], body, 'body'),
    box([0, h * 0.62, 0], [w + 0.02, h * 0.28, len - 0.8], C.glass, 'glass'),
    box([0, h * 0.62, len / 2 - 0.35], [w - 0.3, h * 0.3, 0.1], C.glass, 'glass'),
    box([0, 0.55, 0], [w + 0.02, 0.22, len - 0.3], stripe, 'stripe'),
    box([0, h - 0.04, 0], [w - 0.2, 0.08, len - 0.4], roofColor, 'roof'),
    box([hw + 0.01, 1.2, len / 2 - 2.2], [0.04, 1.9, 1.1], C.dark),
    box([0, 0.28, 0], [w - 0.1, 0.2, len - 0.4], C.dark),
    ...wheels([-hw + 0.12, hw - 0.12], wheelZ, 1.0, 0.3),
  ];
}

function ambulance(body: string, stripe: string, burnt: boolean): KitPart[] {
  assert(typeof body === 'string');
  assert(typeof stripe === 'string');
  assert(typeof burnt === 'boolean');
  assert(body.length < 1e7);
  assert(stripe.length < 1e7);
  const w = 2.1, len = 5.8;
  return [
    box([0, 1.45, -0.5], [w, 1.75, len - 1.3], body, 'body'),
    box([0, 1.0, 2.15], [w, 1.0, 1.5], body, 'body'),
    box([0, 1.55, 2.25], [w - 0.2, 0.7, 1.2], C.glass, 'glass'),
    box([0, 1.2, -0.5], [w + 0.02, 0.35, len - 1.3], stripe, 'stripe'),
    box([0, 2.4, 1.2], [1.2, 0.14, 0.3], burnt ? C.ash : C.red, 'light'),
    box([0, 0.4, 0], [w - 0.1, 0.12, len - 0.2], C.dark),
    ...wheels([-0.95, 0.95], [1.9, -1.9], 0.8, 0.26),
  ];
}

// Overturned and burnt variants (the format has yaw only, so these are separate models).
function burnt(parts: KitPart[]): KitPart[] { 
  assert(typeof parts === 'object');
  assert(parts.length < 1e7);
  return parts.map((p) => ({ ...p, color: p.slot === 'tyre' ? C.tyre : (p.slot === 'glass' ? '#2a2a2c' : C.char), slot: undefined })).map((p) => { 
  assert(typeof p === 'object');
  if (!p.slot) delete p.slot; return p; }); }
function overturned(parts: KitPart[]): KitPart[] { 
  assert(typeof parts === 'object');
  assert(parts.length < 1e7);
  return parts.map((p): KitPart => ({ ...p, pos: [-p.pos[0], -p.pos[1], p.pos[2]], rot: [p.rot[0], p.rot[1], p.rot[2] + 180] })); }

// ---- buildings
function shophouse(storeys: number, color: string, trim: string): KitPart[] {
  assert(typeof storeys === 'number');
  assert(typeof color === 'string');
  assert(typeof trim === 'string');
  assert(!Number.isNaN(storeys));
  assert(color.length < 1e7);
  assert(trim.length < 1e7);
  const w = 5.5, d = 14, way = 1.5, gh = 3.4, sh = 2.9;
  const H = gh + (storeys - 1) * sh;
  const parts = [
    box([0, gh / 2, -way / 2], [w, gh, d - way], color, 'wall'),                       // ground floor body, recessed
    box([0, gh + (H - gh) / 2, 0], [w, H - gh, d], color, 'wall'),                    // upper floors reach the front
    box([0, 0.05, d / 2 - way / 2], [w, 0.1, way], C.concrete, 'floor'),              // five-foot way deck
    box([-w / 2 + 0.2, gh / 2, d / 2 - 0.2], [0.4, gh, 0.4], trim, 'trim'),           // columns
    box([w / 2 - 0.2, gh / 2, d / 2 - 0.2], [0.4, gh, 0.4], trim, 'trim'),
    box([0, 1.2, d / 2 - way + 0.03], [3.2, 2.2, 0.06], C.glass, 'glass'),            // shop window
    box([-1.9, 1.1, d / 2 - way + 0.04], [0.8, 2.1, 0.06], C.wood, 'door'),           // door
    box([0, gh - 0.3, d / 2 - way + 0.05], [w - 0.3, 0.5, 0.08], C.red, 'sign'),      // fascia sign board
    wed([0, H + 0.9, 0], [w + 0.4, 1.8, d + 0.4], C.brick, 'roof'),
  ];
  for (let s = 1; s < storeys; s++) {
    const y = gh + (s - 1) * sh + sh / 2;
    parts.push(box([-1.2, y, d / 2 + 0.03], [1.0, 1.7, 0.06], C.glass, 'glass'), box([1.2, y, d / 2 + 0.03], [1.0, 1.7, 0.06], C.glass, 'glass'));
    parts.push(box([-1.2, y - 0.9, d / 2 + 0.08], [1.3, 0.1, 0.16], trim, 'trim'), box([1.2, y - 0.9, d / 2 + 0.08], [1.3, 0.1, 0.16], trim, 'trim'));
  }
  return parts;
}
function stairs(): KitPart[] {
  const parts: KitPart[] = [], n = 14, rise = 0.17, run = 0.28, w = 1.2;
  for (let i = 0; i < n; i++) parts.push(box([0, (i + 1) * rise / 2, -n * run / 2 + (i + 0.5) * run], [w, (i + 1) * rise, run], i % 2 ? C.concrete : C.grey, 'step'));
  return parts;
}

// ---- MRT station (Singapore). The train runs along its local z (the same way as the buses) and has a
// door gap on both sides, so a person can walk in only through a door. The platform screen doors are
// full height, as at the underground stations. The train car carries the scene tag "floor" when it is
// placed: the body is not a wall, and people walk in it.
function mrtTrain(): KitPart[] {
  const w = 3.2, len = 24, wx = 1.52, gapW = 1.6, doorZ: number[] = [-7.2, 0, 7.2], T = 0.16;
  const parts = [
    box([0, 0.03, 0], [w - 0.2, 0.06, len - 0.4], C.floor, 'floor'),                 // floor inside the car
    box([0, 2.72, 0], [w + 0.04, 0.24, len], C.train, 'roof'),                       // roof
    box([0, 2.96, -6], [1.6, 0.24, 5], C.steel, 'roof'), box([0, 2.96, 6], [1.6, 0.24, 5], C.steel, 'roof'),
    box([0, 0.75, 0], [w - 0.1, 0.3, len - 0.5], C.train, 'body'),                   // skirt below the floor line
    box([0, 0.9, len / 2 + 0.02], [w - 0.6, 1.5, 0.06], C.glass, 'glass'),          // cab windows at both ends
    box([0, 0.9, -len / 2 - 0.02], [w - 0.6, 1.5, 0.06], C.glass, 'glass'),
  ];
  // side walls: a segment between each door gap, with a window band and a red stripe on the outside
  for (const sx of [-1, 1]) {
    const x = sx * wx;
    const segs: [number, number][] = [[-11.84, -8.0], [-6.4, -0.8], [0.8, 6.4], [8.0, 11.84]];
    for (const [a, b] of segs) {
      const mid = (a + b) / 2, segLen = b - a;
      parts.push(box([x, 1.33, mid], [T, 2.54, segLen], C.train, 'body'));
      parts.push(box([sx * 1.6, 1.66, mid], [0.04, 0.95, segLen - 0.4], C.glass, 'glass'));
      parts.push(box([sx * 1.605, 0.98, mid], [0.03, 0.18, segLen - 0.3], C.red, 'stripe'));
    }
    // a door frame and a lintel above each door gap
    for (const z of doorZ) {
      parts.push(box([x, 2.35, z], [T, 0.5, gapW], C.train, 'body'));
      parts.push(box([x, 1.33, z - gapW / 2 - 0.06], [T + 0.04, 2.54, 0.12], C.dark, 'frame'));
      parts.push(box([x, 1.33, z + gapW / 2 + 0.06], [T + 0.04, 2.54, 0.12], C.dark, 'frame'));
    }
  }
  return parts;
}

// Finish: centre every model on x and z, put its lowest point at y=0, and set size from the parts.
function finish(m: RawModel): Model {
  assert(typeof m === 'object');
  const b = modelBounds(m.parts), bmin = tri(b.min), bmax = tri(b.max);
  const dx = -(bmin[0] + bmax[0]) / 2, dz = -(bmin[2] + bmax[2]) / 2, dy = -bmin[1];
  const parts = m.parts.map((p): KitPart => { 
    assert(typeof r === 'function');
    assert(typeof p === 'object');
    const q: KitPart = { ...p, pos: [r(p.pos[0] + dx), r(p.pos[1] + dy), r(p.pos[2] + dz)] }; if (!q.slot) delete q.slot; return q; });
  const nb = modelBounds(parts), nsize = tri(nb.size);
  const out: Model = { id: m.id, name: m.name, kind: m.kind, license: LICENSE, size: v3(nsize), parts };
  if (m.tags?.length) out.tags = m.tags;
  // base: the footprint [x0, z0, x1, z1] of the parts that reach below 1 m, when it is smaller than the
  // whole model (a tree trunk under its crown, a lamp post under its arm). Collisions use it.
  const low = parts.filter((p) => tri(partBounds(p).min)[1] < 1);
  if (low.length) {
    const lb = modelBounds(low), lmin = tri(lb.min), lmax = tri(lb.max), lsize = tri(lb.size);
    const base: [number, number, number, number] = [r(lmin[0]), r(lmin[2]), r(lmax[0]), r(lmax[2])];
    if (lsize[0] < nsize[0] - 0.05 || lsize[2] < nsize[2] - 0.05) out.base = base;
  }
  return out;
}
const models: RawModel[] = [];
function add(id: string, name: string, kind: string, parts: KitPart[], tags: string[] = []): number { 
  assert(typeof id === 'string');
  assert(typeof name === 'string');
  assert(typeof kind === 'string');
  assert(typeof parts === 'object');
  assert(id.length < 1e7);
  assert(name.length < 1e7);
  assert(kind.length < 1e7);
  assert(parts.length < 1e7);
  return models.push({ id, name, kind, parts, tags }); }
function roadTile(w: number, d: number, extras: KitPart[]): KitPart[] { 
  assert(typeof w === 'number');
  assert(typeof d === 'number');
  assert(typeof extras === 'object');
  assert(!Number.isNaN(w));
  assert(!Number.isNaN(d));
  assert(extras.length < 1e7);
  return [box([0, 0.05, 0], [w, 0.1, d], C.asphalt, 'asphalt'), ...extras]; }
const dashes: KitPart[] = []; for (let i = -4; i <= 4; i += 2) dashes.push(box([0, 0.105, i + 0.5], [0.12, 0.012, 1.0], C.line));

// ---- outfits: colours and parts that a person wears. A part follows one bone of the body (names in
// assets/people/skel.json). pos and rot are in the rest pose: origin between the feet, facing +z.
const SPF = 'https://en.wikipedia.org/wiki/Uniforms_of_the_Singapore_Police_Force';
const RIOT = 'https://en.wikipedia.org/wiki/2013_Little_India_riot';
const SOC_KIT = 'https://www.hometeamns.sg/frontline/ensuring-safety-security-of-singapore/';
const SOC_DRILL = 'https://www.nas.gov.sg/archivesonline/photographs/record-details/d3115385-1161-11e3-83d5-0050568939ad';
function gear(bone: string, prim: Prim, pos: Vec3, size: Vec3, color: string, rot?: Vec3 | null): OutfitPart { 
  assert(typeof bone === 'string');
  assert(typeof prim === 'string');
  assert(typeof pos === 'object');
  assert(typeof size === 'object');
  assert(typeof color === 'string');
  assert(bone.length < 1e7);
  assert(prim.length < 1e7);
  assert(pos.length < 1e7);
  assert(size.length < 1e7);
  assert(color.length < 1e7);
  return ({ bone, ...part(prim, pos, size, color, null, rot) }); }
// A part held in the left hand. pos and rot give its place in the stand pose. The part follows the left
// forearm, so the hand and the part move together. The stand pose turns the upper arm 35 degrees down
// round the shoulder (engine/scene.goose, pose_angles), so the rest-pose place turns 35 degrees back.
const SHOULDER_L: [number, number] = [0.17, 1.37], ARM_DOWN = 35;
function held(prim: Prim, pos: Vec3, size: Vec3, color: string, rot: Vec3 = [0, 0, 0]): OutfitPart {
  assert(typeof prim === 'string');
  assert(typeof pos === 'object');
  assert(typeof size === 'object');
  assert(typeof color === 'string');
  assert(prim.length < 1e7);
  assert(pos.length < 1e7);
  assert(size.length < 1e7);
  assert(color.length < 1e7);
  const a = (ARM_DOWN * Math.PI) / 180, dx = pos[0] - SHOULDER_L[0], dy = pos[1] - SHOULDER_L[1];
  const rest: Vec3 = [SHOULDER_L[0] + dx * Math.cos(a) - dy * Math.sin(a), SHOULDER_L[1] + dx * Math.sin(a) + dy * Math.cos(a), pos[2]];
  return gear('lowerarm01.L', prim, rest, size, color, [rot[0], rot[1], rot[2] + ARM_DOWN]);
}
function helmet(color: string): OutfitPart { 
  assert(typeof color === 'string');
  assert(color.length < 1e7);
  return gear('head', 'sphere', [0, 1.655, 0.01], [0.25, 0.23, 0.27], color); }
const outfits: Outfit[] = [];
function outfit(id: string, name: string, colors: Outfit['colors'], parts: OutfitPart[], source: string, note: string): number { 
  assert(typeof id === 'string');
  assert(typeof name === 'string');
  assert(typeof colors === 'object');
  assert(typeof parts === 'object');
  assert(typeof source === 'string');
  assert(typeof note === 'string');
  assert(id.length < 1e7);
  assert(name.length < 1e7);
  assert(parts.length < 1e7);
  assert(source.length < 1e7);
  assert(note.length < 1e7);
  return outfits.push({ id, name, colors, parts, source, note }); }
function addKit1(): void {

  // ---- vehicles
  add('car-sedan', 'Sedan', 'vehicle', car({ body: C.blue }), ['car', 'vehicle']);
  add('car-taxi', 'Taxi', 'vehicle', car({ body: C.yellow, extra: [box([0, 1.55, -0.2], [0.7, 0.18, 0.25], C.white, 'sign')] }), ['car', 'taxi']);
  add('car-police', 'Police car', 'vehicle', car({ body: C.white, roof: C.white, extra: [
    box([0, 0.8, 0], [1.82, 0.14, 4.4], C.navy, 'stripe'),
    box([-0.25, 1.52, -0.2], [0.4, 0.14, 0.25], C.red, 'light'), box([0.25, 1.52, -0.2], [0.4, 0.14, 0.25], C.blue, 'light')] }), ['car', 'police']);
  add('ambulance-scdf', 'SCDF ambulance', 'vehicle', ambulance(C.red, C.white, false), ['ambulance', 'scdf']);
  add('bus-public', 'Public bus', 'vehicle', bus({ len: 12, w: 2.5, h: 3.2, body: C.white, stripe: C.red, roofColor: C.concrete, wheelZ: [3.8, -3.8] }), ['bus']);
  add('bus-private', 'Private bus', 'vehicle', bus({ len: 10, w: 2.4, h: 3.1, body: C.cream, stripe: C.teal, roofColor: C.white, wheelZ: [3.2, -3.2] }), ['bus', 'private']);
  add('lorry', 'Lorry', 'vehicle', [
    box([0, 1.1, 2.6], [2.3, 1.9, 1.7], C.green, 'body'), box([0, 1.7, 3.0], [2.2, 0.7, 0.9], C.glass, 'glass'),
    box([0, 0.55, 0], [2.3, 0.3, 7.5], C.dark), box([0, 1.95, -0.7], [2.4, 2.8, 5.4], C.white, 'cargo'),
    ...wheels([-1.0, 1.0], [2.8, -1.2, -2.6], 0.9, 0.3),
  ], ['lorry', 'truck']);
  add('motorbike', 'Motorbike', 'vehicle', [
    cyl([0, 0.3, 0.7], [0.6, 0.12, 0.6], C.tyre, 'tyre', [0, 0, 90]), cyl([0, 0.3, -0.7], [0.6, 0.14, 0.6], C.tyre, 'tyre', [0, 0, 90]),
    box([0, 0.6, 0], [0.3, 0.35, 1.0], C.red, 'body'), box([0, 0.85, -0.25], [0.28, 0.1, 0.6], C.dark),
    box([0, 1.0, 0.55], [0.7, 0.05, 0.05], C.dark), box([0, 0.75, 0.6], [0.1, 0.5, 0.1], C.steel),
  ], ['motorbike']);
  const byId = (id: string): KitPart[] => {
    assert(typeof id === 'string');
    const m = models.find((m) => m.id === id);
    if (!m) throw new Error(`no model ${id}`);
    return m.parts;
  };
  add('car-police-overturned', 'Police car, overturned', 'vehicle', overturned(byId('car-police')), ['police', 'overturned']);
  add('car-police-burnt', 'Police car, burnt', 'vehicle', burnt(byId('car-police')), ['police', 'burnt']);
  add('ambulance-scdf-overturned', 'SCDF ambulance, overturned', 'vehicle', overturned(byId('ambulance-scdf')), ['ambulance', 'overturned']);
  add('ambulance-scdf-burnt', 'SCDF ambulance, burnt', 'vehicle', burnt(byId('ambulance-scdf')), ['ambulance', 'burnt']);
  add('flame', 'Flame', 'prop', [
    wed([0, 0.5, 0], [0.7, 1.0, 0.7], C.orange), wed([0.1, 0.4, 0.05], [0.4, 0.8, 0.4], C.yellow, null, [0, 90, 0]),
  ], ['fire', 'effect']);
  add('shophouse-2', 'Shophouse, 2 storeys', 'building', shophouse(2, C.pink, C.teal), ['shophouse', 'five-foot-way']);
  add('shophouse-3', 'Shophouse, 3 storeys', 'building', shophouse(3, C.sand, C.green), ['shophouse', 'five-foot-way']);
  add('shopfront-a', 'Shop front, glass', 'building', [
    box([0, 1.5, -0.1], [5, 3, 0.2], C.cream, 'wall'), box([-0.4, 1.1, 0.02], [3.0, 2.0, 0.06], C.glass, 'glass'),
    box([1.8, 1.05, 0.02], [0.9, 2.1, 0.06], C.wood, 'door'), box([0, 2.75, 0.06], [4.8, 0.45, 0.08], C.blue, 'sign'),
  ], ['shopfront']);
  add('shopfront-b', 'Shop front, shutter', 'building', [
    box([0, 1.5, -0.1], [4, 3, 0.2], C.sage, 'wall'), box([0, 1.1, 0.02], [3.2, 2.1, 0.06], C.steel, 'shutter'),
    box([0, 2.7, 0.06], [3.8, 0.5, 0.08], C.yellow, 'sign'),
  ], ['shopfront']);
  const hdb: KitPart[] = [box([0, 16.5, 0], [60, 33, 12], C.cream, 'wall'), box([0, 33.3, 0], [60.4, 0.6, 12.4], C.brick, 'roof')];
  for (let f = 0; f < 11; f++) hdb.push(box([0, 2 + f * 2.9, 6.02], [58, 1.1, 0.06], C.glass, 'glass'));
  hdb.push(box([-27, 16.5, 6.1], [3, 33, 0.2], C.lilac, 'core'), box([27, 16.5, 6.1], [3, 33, 0.2], C.lilac, 'core'));
  add('hdb-slab', 'HDB block, slab', 'building', hdb, ['hdb', 'residential']);

  // ---- street furniture and roads
  add('bus-stop', 'Bus stop', 'structure', [
    box([0, 2.7, 0], [3.5, 0.12, 1.5], C.blue, 'roof'), box([-1.7, 1.35, 0], [0.1, 2.7, 1.4], C.steel), box([1.7, 1.35, 0], [0.1, 2.7, 1.4], C.steel),
    box([0, 1.4, -0.7], [3.3, 2.2, 0.05], C.glass, 'glass'), box([0, 0.45, -0.3], [2.4, 0.08, 0.45], C.wood, 'seat'),
    box([0, 0.2, -0.3], [2.2, 0.4, 0.1], C.dark), box([2.1, 1.3, 0.6], [0.08, 2.6, 0.08], C.steel), box([2.1, 2.3, 0.6], [0.5, 0.45, 0.06], C.red, 'sign'),
  ], ['bus-stop']);
  add('kerb', 'Kerb piece', 'road', [box([0, 0.075, 0], [2, 0.15, 0.3], C.concrete)], ['kerb']);
  add('road-straight', 'Road, straight (2 lanes, along z)', 'road', roadTile(8, 10, dashes), ['road']);
}
function addKit2(): void {
  add('road-junction', 'Road, 4-way junction', 'road', roadTile(8, 8, [
    box([0, 0.105, 3.6], [8, 0.012, 0.25], C.line), box([0, 0.105, -3.6], [8, 0.012, 0.25], C.line)]), ['road', 'junction']);
  const zebra: KitPart[] = []; for (let i = -3.5; i <= 3.5; i += 1) zebra.push(box([i, 0.105, 0], [0.5, 0.012, 3], C.line));
  add('road-zebra', 'Road, zebra crossing', 'road', roadTile(8, 3, zebra), ['road', 'crossing']);
  add('lamp-post', 'Lamp post', 'prop', [
    cyl([0, 3.5, 0], [0.14, 7, 0.14], C.steel), box([0.6, 7.0, 0], [1.3, 0.1, 0.1], C.steel), box([1.2, 6.9, 0], [0.5, 0.15, 0.25], C.yellow, 'lamp'),
    cyl([0, 0.15, 0], [0.4, 0.3, 0.4], C.dark),
  ], ['lamp']);
  add('traffic-light', 'Traffic light', 'prop', [
    cyl([0, 2.75, 0], [0.14, 5.5, 0.14], C.dark), box([0, 5.2, 0.15], [0.35, 1.0, 0.25], C.dark),
    sph([0, 5.5, 0.3], [0.2, 0.2, 0.2], C.red, 'red'), sph([0, 5.2, 0.3], [0.2, 0.2, 0.2], C.yellow, 'amber'), sph([0, 4.9, 0.3], [0.2, 0.2, 0.2], C.green, 'green'),
  ], ['traffic']);
  add('bin', 'Rubbish bin', 'prop', [cyl([0, 0.45, 0], [0.5, 0.9, 0.5], C.darkgreen, 'body'), cyl([0, 0.92, 0], [0.54, 0.06, 0.54], C.dark)], ['bin']);
  add('bin-recycling', 'Recycling bin', 'prop', [box([0, 0.5, 0], [0.7, 1.0, 0.5], C.blue, 'body'), box([0, 1.03, 0], [0.72, 0.06, 0.52], C.dark)], ['bin']);
  add('barrier', 'Crowd barrier', 'prop', [
    box([0, 0.95, 0], [2.2, 0.08, 0.06], C.steel), box([0, 0.55, 0], [2.2, 0.08, 0.06], C.steel), box([0, 0.25, 0], [2.2, 0.08, 0.06], C.steel),
    box([-1.05, 0.5, 0], [0.06, 1.0, 0.5], C.steel), box([1.05, 0.5, 0], [0.06, 1.0, 0.5], C.steel), box([0, 0.7, 0], [2.0, 0.4, 0.02], C.yellow, 'panel'),
  ], ['barrier']);
  add('cone', 'Traffic cone', 'prop', [
    box([0, 0.025, 0], [0.4, 0.05, 0.4], C.dark), cyl([0, 0.2, 0], [0.32, 0.3, 0.32], C.orange, 'body'),
    cyl([0, 0.45, 0], [0.2, 0.3, 0.2], C.orange, 'body'), cyl([0, 0.66, 0], [0.1, 0.1, 0.1], C.orange, 'body'), cyl([0, 0.4, 0], [0.24, 0.06, 0.24], C.white),
  ], ['cone']);
  add('tree', 'Tree', 'nature', [cyl([0, 1.6, 0], [0.4, 3.2, 0.4], C.wood), sph([0, 4.2, 0], [4, 3.6, 4], C.darkgreen, 'leaf'), sph([0.6, 3.6, 0.5], [2.6, 2.2, 2.6], C.green, 'leaf')], ['tree']);
  add('bench', 'Bench', 'prop', [
    box([0, 0.45, 0], [1.6, 0.08, 0.45], C.wood, 'seat'), box([0, 0.75, -0.2], [1.6, 0.4, 0.06], C.wood, 'seat'),
    box([-0.7, 0.22, 0], [0.08, 0.44, 0.4], C.dark), box([0.7, 0.22, 0], [0.08, 0.44, 0.4], C.dark),
  ], ['bench']);
  add('sign', 'Sign (label on the board)', 'sign', [
    cyl([0, 1.2, 0], [0.08, 2.4, 0.08], C.steel), box([0, 2.0, 0.06], [1.2, 0.6, 0.06], C.white, 'board'),
  ], ['sign', 'label']);
  add('sign-large', 'Sign, large board', 'sign', [
    box([-1.2, 1.5, 0], [0.12, 3.0, 0.12], C.steel), box([1.2, 1.5, 0], [0.12, 3.0, 0.12], C.steel), box([0, 2.5, 0.08], [3.0, 1.2, 0.08], C.white, 'board'),
  ], ['sign', 'label']);

  // ---- characters: a soft ball with 2 big eyes, no arms, no mouth, no feet (the narrator of the vid videos).
  // A part with eye true is an eye: blink, look and the other motion words of engine/vid.goose move it.
  const eye = (x: number): KitPart => ({ ...sph([x, 0.525, 0.47], [0.115, 0.25, 0.08], '#ffffff', 'eyes'), eye: true });
  add('narrator', 'Narrator (a pink ball with 2 eyes)', 'prop', [sph([0, 0.5, 0], [1, 1, 1], '#ff2e88', 'body'), eye(-0.135), eye(0.135)], ['character', 'narrator']);

  // ---- indoor
  add('wall-3', 'Wall segment, 3 m', 'structure', [box([0, 1.4, 0], [3, 2.8, 0.15], C.wall, 'wall')], ['wall']);
  add('wall-5', 'Wall segment, 5 m', 'structure', [box([0, 1.4, 0], [5, 2.8, 0.15], C.wall, 'wall')], ['wall']);
  add('wall-door-3', 'Wall with door gap, 3 m', 'structure', [
    box([-0.975, 1.4, 0], [1.05, 2.8, 0.15], C.wall, 'wall'), box([0.975, 1.4, 0], [1.05, 2.8, 0.15], C.wall, 'wall'),
    box([0, 2.45, 0], [0.9, 0.7, 0.15], C.wall, 'wall'),
  ], ['wall', 'door-gap']);
  add('door', 'Door', 'structure', [
    box([0, 2.05, 0], [1.05, 0.1, 0.12], C.dark, 'frame'), box([-0.5, 1.0, 0], [0.05, 2.0, 0.12], C.dark, 'frame'), box([0.5, 1.0, 0], [0.05, 2.0, 0.12], C.dark, 'frame'),
    box([0, 1.0, 0], [0.95, 2.0, 0.05], C.wood, 'leaf'), box([0.35, 1.0, 0.04], [0.04, 0.04, 0.08], C.steel),
  ], ['door']);
  add('window', 'Window', 'structure', [
    box([0, 0.6, 0], [1.2, 1.2, 0.05], C.glass, 'glass'), box([0, 0.03, 0], [1.2, 0.06, 0.1], C.dark, 'frame'), box([0, 1.17, 0], [1.2, 0.06, 0.1], C.dark, 'frame'),
    box([-0.57, 0.6, 0], [0.06, 1.2, 0.1], C.dark, 'frame'), box([0.57, 0.6, 0], [0.06, 1.2, 0.1], C.dark, 'frame'), box([0, 0.6, 0], [0.04, 1.2, 0.1], C.dark, 'frame'),
  ], ['window']);
  add('floor-tile', 'Floor tile, 2 m', 'structure', [box([0, 0.01, 0], [2, 0.02, 2], C.floor, 'floor')], ['floor']);
  add('ceiling-tile', 'Ceiling tile, 2 m', 'structure', [box([0, 0.025, 0], [2, 0.05, 2], C.ceil, 'ceiling')], ['ceiling']);
}
function addKit3(): void {
  add('stairs-14', 'Stairs, flight of 14 steps (rises toward +z)', 'structure', stairs(), ['stairs']);
  add('escalator', 'Escalator (rises toward +z)', 'structure', [
    box([0, 1.75, 0], [1.1, 0.3, 7.6], C.steel, 'body', [-30, 0, 0]),
    box([-0.5, 2.25, 0], [0.1, 0.9, 7.6], C.dark, 'rail', [-30, 0, 0]), box([0.5, 2.25, 0], [0.1, 0.9, 7.6], C.dark, 'rail', [-30, 0, 0]),
  ], ['escalator']);
  add('lift-door', 'Lift door', 'structure', [
    box([0, 2.15, 0], [1.4, 0.1, 0.2], C.dark, 'frame'), box([-0.65, 1.05, 0], [0.1, 2.1, 0.2], C.dark, 'frame'), box([0.65, 1.05, 0], [0.1, 2.1, 0.2], C.dark, 'frame'),
    box([-0.3, 1.05, 0], [0.58, 2.1, 0.06], C.steel, 'leaf'), box([0.3, 1.05, 0], [0.58, 2.1, 0.06], C.steel, 'leaf'), box([0.85, 1.1, 0.05], [0.08, 0.2, 0.04], C.yellow),
  ], ['lift']);
  add('reception-desk', 'Reception desk', 'furniture', [
    box([0, 0.55, 0], [3.0, 1.1, 0.7], C.wood, 'body'), box([0, 1.12, 0], [3.1, 0.05, 0.8], C.white, 'top'), box([0, 1.2, -0.1], [0.5, 0.2, 0.05], C.dark),
  ], ['desk', 'reception']);
  add('table', 'Table', 'furniture', [box([0, 0.73, 0], [1.2, 0.04, 0.7], C.wood, 'top'),
    box([-0.55, 0.36, -0.3], [0.05, 0.72, 0.05], C.dark), box([0.55, 0.36, -0.3], [0.05, 0.72, 0.05], C.dark), box([-0.55, 0.36, 0.3], [0.05, 0.72, 0.05], C.dark), box([0.55, 0.36, 0.3], [0.05, 0.72, 0.05], C.dark)], ['table']);
  add('chair', 'Chair', 'furniture', [
    box([0, 0.45, 0], [0.45, 0.05, 0.45], C.blue, 'seat'), box([0, 0.7, -0.2], [0.45, 0.45, 0.05], C.blue, 'seat'),
    box([-0.2, 0.22, -0.2], [0.04, 0.44, 0.04], C.dark), box([0.2, 0.22, -0.2], [0.04, 0.44, 0.04], C.dark), box([-0.2, 0.22, 0.2], [0.04, 0.44, 0.04], C.dark), box([0.2, 0.22, 0.2], [0.04, 0.44, 0.04], C.dark),
  ], ['chair']);
  const banq: KitPart[] = [cyl([0, 0.73, 0], [1.8, 0.05, 1.8], C.white, 'top'), cyl([0, 0.36, 0], [0.2, 0.72, 0.2], C.dark)];
  for (let i = 0; i < 8; i++) {
    const a = i * 45, rad = 1.25, x = Math.sin(a * Math.PI / 180) * rad, z = Math.cos(a * Math.PI / 180) * rad;
    // chair faces the table: its back lies outside
    banq.push(box([x, 0.45, z], [0.45, 0.05, 0.45], C.lilac, 'chair', [0, a, 0]));
    banq.push(box([Math.sin(a * Math.PI / 180) * (rad + 0.2), 0.7, Math.cos(a * Math.PI / 180) * (rad + 0.2)], [0.45, 0.45, 0.05], C.lilac, 'chair', [0, a, 0]));
  }
  add('banquet-table-8', 'Banquet round table with 8 chairs', 'furniture', banq, ['table', 'banquet']);
  add('stage', 'Stage', 'furniture', [
    box([0, 0.4, 0.4], [8, 0.8, 3.2], C.dark, 'deck'), box([0, 0.81, 0.4], [8, 0.02, 3.2], C.wood, 'deck'),
    box([0, 1.8, -1.8], [8, 3.0, 0.2], C.navy, 'backdrop'),
  ], ['stage']);
  add('sofa', 'Sofa', 'furniture', [
    box([0, 0.25, 0], [2.0, 0.5, 0.9], C.teal, 'body'), box([0, 0.65, -0.35], [2.0, 0.4, 0.2], C.teal, 'body'),
    box([-0.9, 0.55, 0], [0.2, 0.3, 0.9], C.teal, 'body'), box([0.9, 0.55, 0], [0.2, 0.3, 0.9], C.teal, 'body'),
  ], ['sofa']);
  add('plant', 'Potted plant', 'furniture', [cyl([0, 0.2, 0], [0.4, 0.4, 0.4], C.brick, 'pot'), sph([0, 0.8, 0], [0.5, 0.8, 0.5], C.green, 'leaf')], ['plant']);
  add('notice-board', 'Notice board', 'furniture', [
    box([-0.5, 0.95, 0], [0.06, 1.9, 0.06], C.dark), box([0.5, 0.95, 0], [0.06, 1.9, 0.06], C.dark), box([0, 1.3, 0.02], [1.2, 0.9, 0.05], C.wood, 'frame'),
    box([0, 1.3, 0.05], [1.1, 0.8, 0.02], C.sage, 'board'),
  ], ['board', 'label']);
  add('turnstile', 'Turnstile gate', 'furniture', [
    box([0, 0.5, 0], [0.25, 1.0, 0.9], C.steel, 'body'), box([0.35, 0.95, 0], [0.5, 0.04, 0.04], C.glass, 'arm'), box([0, 1.05, 0], [0.27, 0.08, 0.92], C.dark),
  ], ['turnstile']);
  add('mrt-train-car', 'MRT train car (doors on both sides, along z)', 'vehicle', mrtTrain(), ['mrt', 'train', 'carriage']);
  add('mrt-track', 'MRT track, two rails along x', 'road', [
    box([0, 0.03, 0], [24, 0.06, 4], C.asphalt, 'asphalt'),
    box([0, 0.09, -0.72], [24, 0.04, 0.08], C.steel, 'rail'), box([0, 0.09, 0.72], [24, 0.04, 0.08], C.steel, 'rail'),
    ...Array.from({ length: 30 }, (_, i) => box([-11.6 + i * 0.8, 0.075, 0], [0.3, 0.03, 2.2], C.wood, 'sleeper')),
  ], ['mrt', 'track', 'rail']);
  add('mrt-train-door-leaf', 'MRT train door leaf', 'structure', [
    box([0, 1.05, 0], [0.86, 2.1, 0.05], C.train, 'frame'),
    box([0, 1.22, 0.028], [0.7, 1.66, 0.014], C.glass, 'glass'),
    box([0, 0.14, 0.028], [0.8, 0.24, 0.014], C.red, 'stripe'),
  ], ['train-door']);
}
function addKit4(): void {
  add('psd-bay', 'Platform screen door bay, full height (1.4 m door gap)', 'structure', [
    box([0, 2.75, 0], [2.7, 0.42, 0.18], C.train, 'frame'),                          // header
    box([-1.31, 1.48, 0], [0.12, 2.96, 0.2], C.dark, 'frame'), box([1.31, 1.48, 0], [0.12, 2.96, 0.2], C.dark, 'frame'),
    box([0, 0.11, 0], [2.7, 0.22, 0.12], C.dark),                                    // bottom rail
    box([0, 2.52, 0.03], [1.5, 0.1, 0.06], C.dark),                                  // door track
    box([-1.0, 1.35, 0], [0.6, 2.2, 0.06], C.glass, 'glass'), box([1.0, 1.35, 0], [0.6, 2.2, 0.06], C.glass, 'glass'),
    box([0, 2.62, 0.1], [1.7, 0.22, 0.02], C.white, 'board'),                        // station name board
    box([0, 0.26, 0.05], [1.5, 0.02, 0.08], C.yellow),                               // threshold warning line
  ], ['platform-screen-door']);
  add('psd-leaf', 'Platform screen door leaf', 'structure', [
    box([0, 1.1, 0], [0.76, 2.24, 0.05], C.train, 'frame'),
    box([0, 1.22, 0.028], [0.64, 1.72, 0.014], C.glass, 'glass'),
    box([0, 0.18, 0.028], [0.72, 0.3, 0.014], C.dark, 'kick'),
    box([0.28, 1.12, 0.04], [0.04, 0.16, 0.02], C.yellow),
  ], ['platform-screen-door']);
  add('psd-panel', 'Fixed platform screen wall between two door bays, 4.4 m', 'structure', [
    box([0, 2.75, 0], [4.4, 0.42, 0.18], C.train, 'frame'),
    box([0, 0.11, 0], [4.4, 0.22, 0.12], C.dark),
    box([-2.14, 1.48, 0], [0.12, 2.96, 0.2], C.dark, 'frame'), box([2.14, 1.48, 0], [0.12, 2.96, 0.2], C.dark, 'frame'),
    box([0, 1.35, 0], [4.0, 2.2, 0.05], C.glass, 'glass'),
    box([0, 2.52, 0.03], [4.0, 0.1, 0.06], C.dark),
  ], ['platform-screen-door']);
  add('platform-edge-strip', 'Platform edge, yellow line and tactile strip, 4 m', 'structure', [
    box([0, 0.03, -0.3], [4, 0.06, 0.3], C.edge, 'edge'),                            // platform edge band
    box([0, 0.065, 0], [4, 0.012, 0.1], C.yellow, 'line'),                           // yellow line
    box([0, 0.03, 0.3], [4, 0.06, 0.3], C.concrete, 'tactile'),                      // tactile strip
    ...[-0.12, -0.04, 0.04, 0.12].map((dz) => box([0, 0.065, 0.3 + dz], [4, 0.012, 0.03], C.grey)),
  ], ['platform-edge']);
  add('fare-gate', 'Fare gate pedestal (a pair makes a gate)', 'furniture', [
    box([0, 0.55, 0], [0.32, 1.1, 1.5], C.white, 'body'),
    box([0, 1.13, 0], [0.36, 0.06, 1.56], C.steel, 'top'),
    box([0, 1.2, 0.5], [0.26, 0.14, 0.32], C.dark, 'reader'),
    box([0, 1.2, 0.665], [0.2, 0.08, 0.012], C.teal, 'screen'),
    box([-0.18, 0.9, 0.35], [0.06, 0.3, 0.08], C.blue, 'flap'), box([0.18, 0.9, 0.35], [0.06, 0.3, 0.08], C.blue, 'flap'),
    box([0, 0.12, -0.72], [0.3, 0.24, 0.06], C.steel),
  ], ['fare-gate']);
  add('station-wall', 'Station wall panel with posters, 5 m', 'structure', [
    box([0, 2.1, 0], [5, 4.2, 0.28], C.wall, 'wall'),
    box([0, 4.02, 0.16], [5, 0.26, 0.05], C.steel),
    box([0, 0.25, 0.16], [5, 0.5, 0.05], C.concrete),
    box([-1.25, 2.2, 0.155], [1.5, 2.0, 0.03], C.blue, 'poster'),
    box([1.25, 2.2, 0.155], [1.5, 2.0, 0.03], C.teal, 'poster'),
  ], ['station-wall']);
  outfit('police', 'Singapore Police Force officer, dark blue uniform and peak cap', { shirt: '#2b3d5e', pants: '#2b3d5e' }, [
    gear('head', 'cylinder', [0, 1.71, 0.045], [0.22, 0.07, 0.23], '#26324a'), gear('head', 'box', [0, 1.69, 0.17], [0.17, 0.02, 0.07], '#14171c'),
  ], SPF, 'Dark blue shirt, trousers and peak cap. Colour shades are estimated.');
  outfit('police-shield', 'Police officer with helmet and round shield', { shirt: '#2b3d5e', pants: '#2b3d5e' }, [
    helmet('#26324a'),
    held('cylinder', [0.15, 1.05, 0.3], [0.6, 0.03, 0.6], '#b7c3cc', [90, 0, 0]),
  ], RIOT, 'The riot account names officers with helmets and shields at the bus. Shield shape and colours are estimated.');
}
function addKit5(): void {
  outfit('soc-riot', 'Special Operations Command riot officer: helmet with visor, long shield, baton', { shirt: '#1b222c', pants: '#1b222c' }, [
    helmet('#15191f'),
    gear('head', 'box', [0, 1.6, 0.19], [0.22, 0.15, 0.02], '#8fb0c4', [-12, 0, 0]),
    held('box', [0.15, 0.92, 0.3], [0.56, 1.1, 0.03], '#a9c0d0'),
    held('box', [0.15, 1.47, 0.3], [0.58, 0.04, 0.05], '#15191f'),
    held('box', [0.15, 0.37, 0.3], [0.58, 0.04, 0.05], '#15191f'),
    gear('wrist.R', 'cylinder', [-0.47, 1.03, 0.4], [0.035, 0.6, 0.035], '#101215', [90, 0, 0]),
  ], `${SPF} ; ${SOC_KIT} ; ${SOC_DRILL}`, 'Darker blue combat dress, helmet, tactical shield and baton. The visor, shield size and colours are estimated.');
}
function buildKit(): void {
  addKit1();
  addKit2();
  addKit3();
  addKit4();
  addKit5();
}
buildKit();

const ASSETS = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets');

// Boundary: assets/models/index.json is written by tools/assets/import.ts; check the fields the catalogue needs.
function isImported(v: unknown): v is ImportedModel {
  return typeof v === 'object' && v !== null && 'id' in v && typeof v.id === 'string'
    && 'name' in v && typeof v.name === 'string' && 'kind' in v && typeof v.kind === 'string';
}
function readImported(index: string): ImportedModel[] {
  assert(typeof index === 'string');
  assert(index.length < 1e7);
  if (!existsSync(index)) return [];
  const raw: unknown = JSON.parse(readFileSync(index, 'utf8'));
  if (!Array.isArray(raw) || !raw.every(isImported)) throw new Error(`${index}: not a list of models`);
  return raw;
}

export function buildCatalogue(): KitCatalogue {
  const index = join(ASSETS, 'models', 'index.json');
  const imported = readImported(index);
  return { models: [...models.map(finish), ...imported], outfits };
}

export function writeCatalogue(): void {
  const out = join(ASSETS, 'catalogue.json');
  const cat = buildCatalogue();
  writeFileSync(out, JSON.stringify(cat, null, 1) + '\n');
  console.log(`wrote ${cat.models.length} models to ${out}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) writeCatalogue();
