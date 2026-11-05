// Scene model: create, load, save, validate. Format: docs/scene-format.md
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { rotYaw, rectCorners, overlapRatio } from './geom.ts';
import type { Bounds, Poly } from './geom.ts';
import type { Scene, SceneObject, Catalogue, Model, Vec2, Vec3, Ease, Channel, Shot, Ground, Look, Track, TrackKey, TrackValue, SceneMap, CameraKey } from '../web/types.js';
import { narrationErrors, narrationLength } from './narration.ts';
import { MOVES, plain } from '../web/vid.js';
import { FORMAT, isCatalogue, upgradeScene } from '../web/format.js';
import { assert } from './assert.ts';

export type { Bounds };
// One problem that validate, blockedViews or motionErrors found.
export interface ValidationError { code: string; path?: string; message: string }
// The box of an object at one time: its footprint corners ([x, z]), position, yaw and size.
export interface ObjectBounds extends Bounds { corners: Poly; at: Vec3; yaw: number; size: Vec3 }
export interface ObjectState { at: Vec3; yaw: number; scale: Vec3 }
export interface CameraState { eye: Vec3; target: Vec3; fov: number; shot?: Shot }
export interface Camera { eye: Vec3; target: Vec3; fov: number }
const oneOf = (list: readonly string[], v: unknown): boolean => typeof v === 'string' && list.includes(v);

export const POSES: string[] = ['stand', 'walk', 'run', 'wave', 'point', 'cheer', 'sit', 'bend'];
export const SHOTS: string[] = ['wide', 'medium', 'close', 'top', 'follow', 'orbit'];
export const LOOKS: string[] = ['day', 'dusk', 'night', 'indoor'];
export const GROUNDS: string[] = ['grass', 'street', 'floor', 'plain', 'map'];
export const CHANNELS: string[] = ['at', 'yaw', 'scale', 'pose'];
export const EASES: string[] = ['linear', 'inout', 'step'];
export { MOVES, FORMAT };
export const PERSON_SIZE: Vec3 = [0.5, 1.75, 0.35];
export const STRUCTURAL_TAGS: string[] = ['wall', 'floor', 'ceiling'];
export const MAX_CAPTION = 280;
export const MIN_SEC_PER_CHAR = 0.06;
export const MAX_SHOT_MOVE = 1.5;
export const ASPECT = 16 / 9;

const here = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_CATALOGUE = join(here, '..', 'assets', 'catalogue.json');
let catCache: Catalogue | null = null;
export function loadCatalogue(path: string = DEFAULT_CATALOGUE): Catalogue {
  if (path === DEFAULT_CATALOGUE && catCache) return catCache;
  const cat: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!isCatalogue(cat)) throw new Error(`${path} is not a catalogue: it needs models, each with an id and a size.`);
  if (path === DEFAULT_CATALOGUE) catCache = cat;
  return cat;
}

export interface NewSceneOpts { ground?: Ground; title?: string; author?: string; duration?: number; size?: Vec2; color?: string; look?: Look; map?: SceneMap }
export function newScene(opts: NewSceneOpts = {}): Scene {
  const ground = opts.ground || 'grass';
  const s: Scene = {
    toybox: FORMAT,
    title: opts.title || 'Untitled',
    author: opts.author || '',
    duration: opts.duration || 0,
    backdrop: { ground, size: opts.size || [80, 80], color: opts.color || '#9fb88c' },
    lighting: [{ t: 0, look: opts.look || 'day' }],
    objects: [], tracks: [], camera: [], chapters: [], captions: [], callouts: [], credits: [],
  };
  if (opts.map) s.map = opts.map;
  return s;
}

// The file goes through parseScene (inside upgradeScene): a file that is not a scene fails here with a clear message.
export function loadScene(path: string): Scene { 
  assert(typeof path === 'string');
  assert(path.length < 1e7);
  return upgradeScene(JSON.parse(readFileSync(path, 'utf8'))); }
export function saveScene(path: string, scene: Scene): void {
  assert(typeof path === 'string');
  assert(typeof scene === 'object');
  assert(path.length < 1e7);
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(scene, null, 1) + '\n');
  renameSync(tmp, path);
}

// ---------- interpolation
const ease = (e: Ease | undefined, u: number): number => (e === 'inout' ? u * u * (3 - 2 * u) : u);
const lerpN = (a: number, b: number, u: number): number => {
  assert(typeof a === 'number');
  assert(typeof b === 'number');
  assert(typeof u === 'number');
  assert(!Number.isNaN(a));
  assert(!Number.isNaN(b));
  assert(!Number.isNaN(u));
  const returned = a + (b - a) * u;
  assert(typeof returned === 'number');
  return returned;
};
const lerp3 = (a: Vec3, b: Vec3, u: number): Vec3 => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
const isVec3 = (v: unknown): v is Vec3 => Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === 'number');
function lerpV(a: TrackValue, b: TrackValue, u: number): TrackValue {
  assert(typeof u === 'number');
  assert(!Number.isNaN(u));
  if (isVec3(a) && isVec3(b)) return lerp3(a, b, u);
  if (typeof a === 'number' && typeof b === 'number') return lerpN(a, b, u);
  return a;
}
export function valueAt(keys: Pick<TrackKey, 't' | 'v' | 'ease'>[] | undefined, t: number): TrackValue | undefined {
  assert(typeof t === 'number');
  assert(!Number.isNaN(t));
  const first = keys?.[0];
  if (!keys || !first) return undefined;
  if (t <= first.t) return first.v;
  for (const [i, a] of keys.entries()) {
    const b = keys[i + 1];
    if (!b) break;
    if (t < b.t) {
      if (a.ease === 'step' || typeof a.v === 'string') return a.v;
      return lerpV(a.v, b.v, ease(a.ease, (t - a.t) / (b.t - a.t)));
    }
  }
  return keys[keys.length - 1]?.v;
}
export function trackOf(scene: Scene, id: string, channel: Channel): Track | undefined { 
  assert(typeof scene === 'object');
  assert(typeof id === 'string');
  assert(typeof channel === 'string');
  assert(id.length < 1e7);
  assert(channel.length < 1e7);
  return scene.tracks?.find((k) => k.object === id && k.channel === channel); }
export function stateAt(scene: Scene, o: SceneObject, t?: number | null): ObjectState {
  assert(typeof scene === 'object');
  assert(typeof o === 'object');
  const g = <T>(ch: Channel, d: T, ok: (v: unknown) => v is T): T => {
    assert(typeof ch === 'string');
    assert(typeof ok === 'function');
    assert(ch.length < 1e7);
    const tr = t == null ? null : trackOf(scene, o.id, ch), v = tr && t != null ? valueAt(tr.keys, t) : undefined;
    return ok(v) ? v : d;
  };
  const isNumOrVec = (v: unknown): v is Vec3 | number => typeof v === 'number' || isVec3(v);
  const isNumber = (v: unknown): v is number => typeof v === 'number';
  const sc = g<Vec3 | number>('scale', o.scale ?? [1, 1, 1], isNumOrVec);
  return { at: g<Vec3>('at', o.at ?? [0, 0, 0], isVec3), yaw: g<number>('yaw', o.yaw ?? 0, isNumber), scale: typeof sc === 'number' ? [sc, sc, sc] : sc };
}

export function cameraAt(scene: Scene, t: number): CameraState | null {
  assert(typeof scene === 'object');
  assert(typeof t === 'number');
  assert(!Number.isNaN(t));
  const ks = scene.camera;
  const first = ks?.[0];
  if (!ks || !first) return null;
  const pack = (k: CameraKey): Camera => ({ eye: k.eye, target: k.target, fov: k.fov ?? 50 });
  if (t <= first.t) return { ...pack(first), shot: first.shot };
  for (const [i, a] of ks.entries()) {
    const b = ks[i + 1];
    if (!b) break;
    if (t < b.t) {
      if (a.ease === 'step') return { ...pack(a), shot: a.shot };
      const u = ease(a.ease, (t - a.t) / (b.t - a.t));
      return { eye: lerp3(a.eye, b.eye, u), target: lerp3(a.target, b.target, u), fov: lerpN(a.fov ?? 50, b.fov ?? 50, u), shot: a.shot };
    }
  }
  const l = ks[ks.length - 1] ?? first;
  return { ...pack(l), shot: l.shot };
}

// ---------- motion-word end time
// The last time at which a motion word still changes the picture, in seconds. The engine uses the
// same defaults and shapes (engine/vid.goose: move_pose, hop, pop, squash, blink). A scene must
// render up to this time, or a trailing motion is cut off (or never drawn at all).
export const MOTION_D: Record<string, number> = { out: 0.3, hop: 0.5, squint: 1.0, look: 1.0, glance: 1.2, wave: 1.6, spin: 0.9 };
const MOTION_NO_D_END: Record<string, number> = { pop: 0.5, squash: 0.62, blink: 0.4 };
export function motionEnd(m: { move?: unknown; t?: unknown; d?: unknown } | null | undefined): number {
  const t = typeof m?.t === 'number' && Number.isFinite(m.t) ? m.t : 0;
  const d = typeof m?.d === 'number' && Number.isFinite(m.d) ? m.d : undefined;
  const move = typeof m?.move === 'string' ? m.move : '';
  const noD = MOTION_NO_D_END[move];
  if (noD !== undefined) return t + noD;
  const len = d ?? MOTION_D[move];
  if (len === undefined) return t + (d ?? 0);
  // hop bounces once more after d: the landing squash at 1.2d and the settle at 1.6d + 0.16.
  if (move === 'hop') return Math.max(t + len, t + 1.6 * len + 0.16);
  const returned = t + len;
  assert(typeof returned === 'number');
  return returned;
}

// ---------- bounds
function modelSize(o: SceneObject, cat: Catalogue): Vec3 | null {
  assert(typeof o === 'object');
  assert(typeof cat === 'object');
  if (o.model === 'person') return PERSON_SIZE;
  return cat.models.find((m) => m.id === o.model)?.size ?? null;
}
export function objectBounds(scene: Scene, catalogue: Catalogue | null | undefined, t?: number | null): Record<string, ObjectBounds> {
  assert(typeof scene === 'object');
  const cat = catalogue || loadCatalogue();
  const byId = new Map((scene.objects || []).map((o): [string, SceneObject] => [o.id, o]));
  const world = (o: SceneObject): ObjectState => {
    assert(typeof o === 'object');
    const chain = [o]; // the object, then its parents up to 8 levels
    for (let p = o.parent ? byId.get(o.parent) : null; p && chain.length <= 8; p = p.parent ? byId.get(p.parent) : null) chain.push(p);
    const states = chain.map((c) => stateAt(scene, c, t));
    let ps = states[states.length - 1] ?? stateAt(scene, o, t);
    for (let i = states.length - 2; i >= 0; i--) {
      const st = states[i] ?? ps;
      const l = rotYaw([st.at[0] * ps.scale[0], st.at[1] * ps.scale[1], st.at[2] * ps.scale[2]], ps.yaw);
      ps = { at: [ps.at[0] + l[0], ps.at[1] + l[1], ps.at[2] + l[2]], yaw: ps.yaw + st.yaw, scale: [st.scale[0] * ps.scale[0], st.scale[1] * ps.scale[1], st.scale[2] * ps.scale[2]] };
    }
    return ps;
  };
  const out: Record<string, ObjectBounds> = {};
  for (const o of scene.objects || []) {
    const sz = modelSize(o, cat);
    if (!sz) continue;
    const st = world(o);
    const w = sz[0] * Math.abs(st.scale[0]), h = sz[1] * Math.abs(st.scale[1]), d = sz[2] * Math.abs(st.scale[2]);
    const corners = rectCorners(st.at[0], st.at[2], w, d, st.yaw);
    const xs = corners.map((c) => {
      assert(typeof c === 'object');
      assert(c.length < 1e7);
      const returned = c[0];
      assert(typeof returned === 'number');
      return returned;
    }), zs = corners.map((c) => {
      assert(typeof c === 'object');
      assert(c.length < 1e7);
      const returned = c[1];
      assert(typeof returned === 'number');
      return returned;
    });
    out[o.id] = { min: [Math.min(...xs), st.at[1], Math.min(...zs)], max: [Math.max(...xs), st.at[1] + h, Math.max(...zs)], corners, at: st.at, yaw: st.yaw, size: [w, h, d] };
  }
  return out;
}

// ---------- camera projection (pinhole, 16:9, vertical fov in degrees)
export function project(cam: Camera, p: Vec3, aspect: number = ASPECT): { x: number; y: number; depth: number } | null {
  assert(typeof cam === 'object');
  assert(typeof p === 'object');
  assert(p.length < 1e7);
  const f = norm(sub(cam.target, cam.eye));
  const right = norm(cross(f, [0, 1, 0]));
  const up = cross(right, f);
  const v = sub(p, cam.eye);
  const z = dot(v, f);
  if (z <= 0.01) return null;
  const th = Math.tan((cam.fov * Math.PI) / 360);
  return { x: dot(v, right) / (z * th * aspect), y: dot(v, up) / (z * th), depth: z };
}
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const norm = (a: Vec3): Vec3 => { 
  assert(typeof a === 'object');
  assert(a.length < 1e7);
  const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export function boundsVisible(cam: Camera, b: ObjectBounds): boolean {
  assert(typeof cam === 'object');
  assert(typeof b === 'object');
  const pts: Vec3[] = [];
  for (const y of [b.min[1], b.max[1]]) for (const c of b.corners) pts.push([c[0], y, c[1]]);
  pts.push([(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2]);
  return pts.some((p) => { 
    assert(typeof p === 'object');
    assert(p.length < 1e7);
    const q = project(cam, p); return q && Math.abs(q.x) <= 1 && Math.abs(q.y) <= 1; });
}

// ---------- blocked views: rays from the camera eye to an object, tested against buildings,
// structures and vehicles (OpenStreetMap footprints and catalogue models).
export const VIEW_STEP = 0.25;      // seconds between samples
export const MAX_BLOCKED = 0.5;     // a focus object may be hidden for at most this long
export const MAX_COVER = 0.2;       // at most this part of the frame may be an occluder in front of the target
const OCCLUDER_KINDS = new Set(['building', 'structure', 'vehicle']);
type Box = [number, number, number, number];
export interface Prism { id: string; poly: Poly; y0: number; y1: number; box: Box }
function prism(id: string, poly: Poly, y0: number, y1: number): Prism {
  assert(typeof id === 'string');
  assert(typeof poly === 'object');
  assert(typeof y0 === 'number');
  assert(typeof y1 === 'number');
  assert(id.length < 1e7);
  assert(poly.length < 1e7);
  assert(!Number.isNaN(y0));
  assert(!Number.isNaN(y1));
  const xs = poly.map((p) => {
    assert(typeof p === 'object');
    assert(p.length < 1e7);
    const returned = p[0];
    assert(typeof returned === 'number');
    return returned;
  }), zs = poly.map((p) => {
    assert(typeof p === 'object');
    assert(p.length < 1e7);
    const returned = p[1];
    assert(typeof returned === 'number');
    return returned;
  });
  return { id, poly, y0, y1, box: [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)] };
}
export function occluders(scene: Scene, cat: Catalogue, bt: Record<string, ObjectBounds>, skip = new Set<string>()): Prism[] {
  assert(typeof scene === 'object');
  assert(typeof cat === 'object');
  assert(typeof bt === 'object');
  const out = (scene.map?.osm?.buildings || []).map((b) => prism(`osm:${b.id}`, b.poly, 0, b.height || 9));
  const kinds = new Map(cat.models.map((m): [string, string] => [m.id, m.kind]));
  const cut = scene.cutaway || {};
  for (const o of scene.objects) {
    const b = bt[o.id], tags = o.tags || [], kind = kinds.get(o.model);
    if (!b || o.hidden || skip.has(o.id) || !kind || !OCCLUDER_KINDS.has(kind) || tags.includes('floor')) continue;
    if ((cut.nearWalls && tags.includes('wall')) || (cut.ceilings && tags.includes('ceiling'))) continue;
    if (b.size[0] < 0.05 || b.size[1] < 0.05 || b.size[2] < 0.05) continue; // scaled to nothing (swapped out)
    out.push(prism(o.id, b.corners, b.min[1], b.max[1]));
  }
  return out;
}
function inPoly([x, z]: Vec2, poly: Poly): boolean {
  assert(typeof poly === 'object');
  assert(poly.length < 1e7);
  let c = false;
  for (const [i, [xi, zi]] of poly.entries()) {
    const [xj, zj] = poly[(i + poly.length - 1) % poly.length] ?? [xi, zi];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}
function segsCross(p: Vec2, q: Vec2, a: Vec2, b: Vec2): boolean {
  assert(typeof p === 'object');
  assert(typeof q === 'object');
  assert(typeof a === 'object');
  assert(typeof b === 'object');
  assert(p.length < 1e7);
  assert(q.length < 1e7);
  assert(a.length < 1e7);
  assert(b.length < 1e7);
  const o = (u: Vec2, v: Vec2, w: Vec2): number => {
    assert(typeof u === 'object');
    assert(typeof v === 'object');
    assert(typeof w === 'object');
    assert(u.length < 1e7);
    assert(v.length < 1e7);
    assert(w.length < 1e7);
    const returned = Math.sign((v[0] - u[0]) * (w[1] - u[1]) - (v[1] - u[1]) * (w[0] - u[0]));
    assert(typeof returned === 'number');
    return returned;
  };
  return o(p, q, a) !== o(p, q, b) && o(a, b, p) !== o(a, b, q);
}
// True when the segment a-b ([x, y, z]) passes through the prism.
export function segmentHits(a: Vec3, b: Vec3, o: Prism): boolean {
  assert(typeof a === 'object');
  assert(typeof b === 'object');
  assert(typeof o === 'object');
  assert(a.length < 1e7);
  assert(b.length < 1e7);
  let s0 = 0, s1 = 1;
  const dy = b[1] - a[1];
  if (Math.abs(dy) < 1e-9) { if (a[1] < o.y0 || a[1] > o.y1) return false; }
  else {
    let u = (o.y0 - a[1]) / dy, w = (o.y1 - a[1]) / dy;
    if (u > w) [u, w] = [w, u];
    s0 = Math.max(s0, u); s1 = Math.min(s1, w);
    if (s0 >= s1) return false;
  }
  const P: Vec2 = [a[0] + (b[0] - a[0]) * s0, a[2] + (b[2] - a[2]) * s0], Q: Vec2 = [a[0] + (b[0] - a[0]) * s1, a[2] + (b[2] - a[2]) * s1];
  if (Math.max(P[0], Q[0]) < o.box[0] || Math.min(P[0], Q[0]) > o.box[2] || Math.max(P[1], Q[1]) < o.box[1] || Math.min(P[1], Q[1]) > o.box[3]) return false;
  if (inPoly(P, o.poly) || inPoly(Q, o.poly)) return true;
  for (const [i, v] of o.poly.entries()) if (segsCross(P, Q, v, o.poly[(i + 1) % o.poly.length] ?? v)) return true;
  return false;
}
// The occluder that hides object bounds b from the camera, or null. Six points of the object are tested
// (centre, top and four corners). Only points inside the frame count. The object is hidden when more
// than half of those points are behind an occluder.
export function blockerOf(cam: Camera, b: ObjectBounds, occ: Prism[]): string | null {
  assert(typeof cam === 'object');
  assert(typeof b === 'object');
  assert(typeof occ === 'object');
  assert(occ.length < 1e7);
  const c = b.corners.reduce<Vec2>((s, p) => {
    assert(typeof s === 'object');
    assert(typeof p === 'object');
    assert(s.length < 1e7);
    assert(p.length < 1e7);
    return [s[0] + p[0] / 4, s[1] + p[1] / 4];
  }, [0, 0]);
  const midY = (b.min[1] + b.max[1]) / 2;
  const pts: Vec3[] = [[c[0], midY, c[1]], [c[0], b.min[1] + 0.9 * (b.max[1] - b.min[1]), c[1]],
    ...b.corners.map((p): Vec3 => [p[0] * 0.7 + c[0] * 0.3, midY, p[1] * 0.7 + c[1] * 0.3])];
  let seen = 0, hidden = 0, by: string | null = null;
  for (const p of pts) {
    const q = project(cam, p);
    if (!q || Math.abs(q.x) > 1 || Math.abs(q.y) > 1) continue;
    seen++;
    // an occluder that holds the point (a person on stairs or in a doorway) does not hide it
    const hit = occ.find((o) => !(p[1] >= o.y0 && p[1] <= o.y1 && inPoly([p[0], p[2]], o.poly)) && segmentHits(cam.eye, p, o));
    if (hit) { hidden++; by = by || hit.id; }
  }
  return seen && hidden * 2 > seen ? by : null;
}
// The part of the frame (a 16 by 9 grid of rays) where an occluder stands between the camera and the
// depth of its target, and the occluder that covers the most of it. Each ray ends at the target depth,
// or on the ground. A ray that ends inside the footprint of the occluder that it meets only sees that
// building (a roof in a top shot), so it does not count.
export function frameCover(cam: Camera, occ: Prism[]): { part: number; by: string | null } {
  assert(typeof cam === 'object');
  assert(typeof occ === 'object');
  assert(occ.length < 1e7);
  const f = norm(sub(cam.target, cam.eye)), r = norm(cross(f, [0, 1, 0])), u = cross(r, f);
  const th = Math.tan((cam.fov * Math.PI) / 360), depth = Math.hypot(...sub(cam.target, cam.eye));
  const count = new Map<string, number>();
  let hidden = 0;
  for (let j = 0; j < 9; j++) for (let i = 0; i < 16; i++) {
    const x = (-1 + (i + 0.5) / 8) * th * ASPECT, y = (1 - (j + 0.5) / 4.5) * th;
    const comp = (k: 0 | 1 | 2): number => {
      assert(typeof cam === 'object');
      assert(typeof f === 'object');
      assert(typeof r === 'object');
      assert(f.length < 1e7);
      assert(r.length < 1e7);
      assert(typeof k === 'number');
      assert(!Number.isNaN(k));
      const returned = cam.eye[k] + (f[k] + r[k] * x + u[k] * y) * depth;
      assert(typeof returned === 'number');
      return returned;
    };
    let p: Vec3 = [comp(0), comp(1), comp(2)];
    if (p[1] < 0 && cam.eye[1] > 0) { const s = cam.eye[1] / (cam.eye[1] - p[1]); p = lerp3(cam.eye, p, s); }
    const hit = occ.find((o) => !inPoly([p[0], p[2]], o.poly) && segmentHits(cam.eye, p, o));
    if (hit) { hidden++; count.set(hit.id, (count.get(hit.id) || 0) + 1); }
  }
  return { part: hidden / 144, by: [...count].sort((a, b) => {
    assert(typeof a === 'object');
    assert(typeof b === 'object');
    assert(a.length < 1e7);
    assert(b.length < 1e7);
    const returned = b[1] - a[1];
    assert(typeof returned === 'number');
    return returned;
  })[0]?.[0] || null };
}

// The focus objects that an occluder hides from the camera at time t ([{ id, by }]), and the occluder that
// covers more than MAX_COVER of the frame in front of the target (frame, or null). The focus objects are
// not occluders.
export function viewBlocks(scene: Scene, cat: Catalogue, cam: Camera, focus: string[], t: number): { objects: { id: string; by: string }[]; frame: string | null } {
  assert(typeof scene === 'object');
  assert(typeof cat === 'object');
  assert(typeof cam === 'object');
  assert(typeof focus === 'object');
  assert(typeof t === 'number');
  assert(focus.length < 1e7);
  assert(!Number.isNaN(t));
  const bt = objectBounds(scene, cat, t), occ = occluders(scene, cat, bt, new Set(focus)), objects: { id: string; by: string }[] = [];
  for (const id of focus) { const b = bt[id], by = b && Math.min(...b.size) >= 0.05 && blockerOf(cam, b, occ); if (by) objects.push({ id, by }); }
  const cover = frameCover(cam, occ);
  return { objects, frame: cover.part > MAX_COVER ? cover.by : null };
}
// The visible focus objects of the chapter that holds time t, or null when no chapter holds t. At a
// boundary the chapter that starts at t holds it.
export function focusAt(scene: Scene, t: number): string[] | null {
  assert(typeof scene === 'object');
  assert(typeof t === 'number');
  assert(!Number.isNaN(t));
  const cs = scene.chapters || [];
  const c = cs.find((k) => k.start <= t && t < k.end) ?? cs.find((k) => k.start <= t && t <= k.end);
  return c ? (c.focus || []).filter((f) => scene.objects.some((o) => o.id === f && !o.hidden)) : null;
}

// Every time span longer than MAX_BLOCKED in which an occluder hides a chapter focus object, or covers
// more than MAX_COVER of the frame in front of the camera target. Sampled every VIEW_STEP.
export function blockedViews(scene: Scene, catalogue?: Catalogue | null): ValidationError[] {
  assert(typeof MAX_BLOCKED === 'number');
  assert(typeof MAX_COVER === 'number');
  assert(typeof VIEW_STEP === 'number');
  assert(!Number.isNaN(MAX_BLOCKED));
  assert(!Number.isNaN(MAX_COVER));
  assert(typeof scene === 'object');
  const cat = catalogue || loadCatalogue();
  const errs: ValidationError[] = [];
  (scene.chapters || []).forEach((c, i) => {
    assert(typeof scene === 'object');
    assert(typeof MAX_BLOCKED === 'number');
    assert(typeof errs === 'object');
    assert(!Number.isNaN(MAX_BLOCKED));
    assert(errs.length < 1e7);
    assert(typeof c === 'object');
    assert(typeof i === 'number');
    assert(!Number.isNaN(i));
    const focus = (c.focus || []).filter((f) => scene.objects.some((o) => o.id === f && !o.hidden));
    if (!(c.end > c.start)) return;
    const FRAME = '\u0000frame', runs = new Map<string, { t0: number; by: string } | null>([...focus, FRAME].map((f): [string, null] => [f, null]));
    const close = (f: string, t: number): void => {
      assert(typeof runs === 'object');
      assert(typeof MAX_BLOCKED === 'number');
      assert(typeof errs === 'object');
      assert(!Number.isNaN(MAX_BLOCKED));
      assert(typeof f === 'string');
      assert(typeof t === 'number');
      assert(f.length < 1e7);
      assert(!Number.isNaN(t));
      const r = runs.get(f);
      if (r && t - r.t0 > MAX_BLOCKED + 1e-9) errs.push({ code: 'view_blocked', path: `chapters[${i}]`,
        message: `Chapter ${c.id}: ${r.by} ${f === FRAME ? `covers more than ${MAX_COVER * 100} percent of the frame in front of the camera target` : `hides focus object ${f}`} from ${r.t0.toFixed(2)} s to ${t.toFixed(2)} s. Move the camera (another view angle, a higher elevation, or a shot along the street) so nothing stands between the camera and the subject.` });
      runs.set(f, null);
    };
    const mark = (f: string, by: string | null | undefined, t: number): void => { 
      assert(typeof f === 'string');
      assert(typeof t === 'number');
      assert(f.length < 1e7);
      assert(!Number.isNaN(t));
      if (by && !runs.get(f)) runs.set(f, { t0: t, by }); else if (!by) close(f, t); };
    const n = Math.max(1, Math.round((c.end - c.start) / VIEW_STEP));
    for (let k = 0; k <= n; k++) {
      const t = Math.min(c.end, c.start + k * VIEW_STEP), cam = cameraAt(scene, t);
      if (!cam) return;
      const v = viewBlocks(scene, cat, cam, focus, t);
      for (const f of focus) mark(f, v.objects.find((b) => b.id === f)?.by, t);
      mark(FRAME, v.frame, t);
    }
    for (const f of runs.keys()) close(f, c.end);
  });
  return errs;
}

// ---------- motion: solid objects must not pass into each other, people and vehicles stand on something,
// and moving vehicles keep to their lane. Sampled every VIEW_STEP over the whole scene.
export const TOUCH = 0.1;          // two footprints may share at most this part of the smaller one
export const PERSON_CORE = 0.3;    // the footprint side of a body in metres (arms and gear may touch)
export const MIN_SPEED = 1;        // m/s: a vehicle slower than this is parked, not driving
const MOVE_CHANNELS = new Set(['at', 'yaw', 'scale']);
// The footprint of o: the core of a person, the model base (trunk, pole) when the catalogue gives one, else the bounds.
function footprint(o: SceneObject, b: ObjectBounds, m: Model | undefined): Poly {
  assert(typeof o === 'object');
  assert(typeof b === 'object');
  if (o.model === 'person') return rectCorners(b.at[0], b.at[2], PERSON_CORE, PERSON_CORE, b.yaw);
  if (!m?.base) return b.corners;
  const sx = b.size[0] / m.size[0], sz = b.size[2] / m.size[2], [x0, z0, x1, z1] = m.base;
  const c = rotYaw([((x0 + x1) / 2) * sx, 0, ((z0 + z1) / 2) * sz], b.yaw);
  return rectCorners(b.at[0] + c[0], b.at[2] + c[2], (x1 - x0) * sx, (z1 - z0) * sz, b.yaw);
}
interface Solid { o: SceneObject; b: ObjectBounds; kind: string | undefined; tags: string[]; poly: Poly; y0: number; y1: number; pose: unknown; box: Box }
// The solid objects at time t: no roads, floors, ceilings, effects or doors, nothing scaled to nothing.
function solidsAt(scene: Scene, cat: Catalogue, models: Map<string, Model>, t: number): { bt: Record<string, ObjectBounds>; solids: Solid[] } {
  assert(typeof scene === 'object');
  assert(typeof cat === 'object');
  assert(typeof models === 'object');
  assert(typeof t === 'number');
  assert(!Number.isNaN(t));
  const bt = objectBounds(scene, cat, t), out: Solid[] = [];
  for (const o of scene.objects) {
    const b = bt[o.id], m = models.get(o.model), tags = o.tags || [];
    if (!b || o.hidden || o.parent || Math.min(...b.size) < 0.05 || (m && m.kind === 'road')) continue;
    if (tags.includes('floor') || tags.includes('ceiling') || (m?.tags || []).includes('effect') || o.model === 'door') continue;
    const poly = footprint(o, b, m), xs = poly.map((p) => {
      assert(typeof p === 'object');
      assert(p.length < 1e7);
      const returned = p[0];
      assert(typeof returned === 'number');
      return returned;
    }), zs = poly.map((p) => {
      assert(typeof p === 'object');
      assert(p.length < 1e7);
      const returned = p[1];
      assert(typeof returned === 'number');
      return returned;
    });
    const ptrack = o.model === 'person' ? trackOf(scene, o.id, 'pose') : undefined;
    const pose = o.model === 'person' ? (ptrack ? valueAt(ptrack.keys, t) : o.pose) : null;
    out.push({ o, b, kind: o.model === 'person' ? 'person' : m?.kind, tags: [...tags, ...(m?.tags || [])], poly, y0: b.min[1], y1: b.max[1], pose,
      box: [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)] });
  }
  return { bt, solids: out };
}
// A pair that may share space: a seated person and a seat, a person on stairs.
function mayShare(a: Solid, b: Solid): boolean {
  assert(typeof a === 'object');
  assert(typeof b === 'object');
  for (const [p, q] of [[a, b], [b, a]] as const) {
    if (p.kind !== 'person') continue;
    if (p.pose === 'sit' && (q.kind === 'furniture' || q.kind === 'prop')) return true;
    if (q.tags.includes('stairs') || q.o.model === 'escalator') return true;
  }
  return false;
}
// True when more than TOUCH of the smaller footprint lies inside an OpenStreetMap footprint: the centre
// or a corner pulled 30 percent toward the centre is inside.
function inFootprint(s: Solid, poly: Poly): boolean {
  assert(typeof s === 'object');
  assert(typeof poly === 'object');
  assert(poly.length < 1e7);
  const c = s.poly.reduce<Vec2>((a, p) => {
    assert(typeof a === 'object');
    assert(typeof p === 'object');
    assert(a.length < 1e7);
    assert(p.length < 1e7);
    return [a[0] + p[0] / s.poly.length, a[1] + p[1] / s.poly.length];
  }, [0, 0]);
  const pts: Vec2[] = [c, ...s.poly.map((p): Vec2 => [p[0] * 0.7 + c[0] * 0.3, p[1] * 0.7 + c[1] * 0.3])];
  return pts.some((p) => inPoly(p, poly));
}
const RUN_CODES: Record<string, string> = { c: 'collision', g: 'off_ground', l: 'wrong_lane' };
interface Run { t0: number; t1: number; make: (r: Run) => string }
interface MotionCtx {
  scene: Scene; models: Map<string, Model>; movers: Set<string>; only: Set<string> | null;
  osm: ReturnType<typeof prism>[]; drive: string; roads: SceneObject[];
  seen: (key: string, t: number, make: (r: Run) => string) => void;
}
type Solids = ReturnType<typeof solidsAt>['solids'];
function mineOf(ctx: MotionCtx, s: Solid): boolean { 
  assert(typeof ctx === 'object');
  assert(typeof s === 'object');
  return !ctx.only || ctx.only.has(s.o.id); }
function collisionsAt(ctx: MotionCtx, t: number, solids: Solids): void {
  assert(typeof ctx === 'object');
  assert(typeof t === 'number');
  assert(typeof solids === 'object');
  assert(!Number.isNaN(t));
  assert(solids.length < 1e7);
  const { movers } = ctx;
  const order = [...solids].sort((a, b) => {
    assert(typeof a === 'object');
    assert(typeof b === 'object');
    const returned = a.box[0] - b.box[0];
    assert(typeof returned === 'number');
    return returned;
  });
  for (const [i, A] of order.entries()) {
    for (let j = i + 1; j < order.length; j++) {
      const B = order[j];
      if (!B || !(B.box[0] < A.box[2])) break;
      if (!mineOf(ctx, A) && !mineOf(ctx, B)) continue;
      if (!movers.has(A.o.id) && !movers.has(B.o.id) && A.kind !== 'person' && B.kind !== 'person') continue; // the overlap check of validate
      if (B.box[1] >= A.box[3] || A.box[1] >= B.box[3] || A.y0 >= B.y1 || B.y0 >= A.y1 || mayShare(A, B)) continue;
      if (overlapRatio(A.poly, B.poly) <= TOUCH) continue;
      const [p, q]: [string, string] = A.o.id <= B.o.id ? [A.o.id, B.o.id] : [B.o.id, A.o.id];
      ctx.seen(`c|${p}|${q}`, t, (r) => {
        assert(typeof r === 'object');
        const returned = `${p} and ${q} pass into each other from ${r.t0.toFixed(2)} s to ${r.t1.toFixed(2)} s. Change a path or a time so that they keep apart: another lane, a gap, a wait, or a way round.`;
        assert(typeof returned === 'string');
        return returned;
      });
    }
  }
}
function heldUp(ctx: MotionCtx, S: Solid, bt: Record<string, ObjectBounds>, c: Vec2): boolean {
  assert(typeof ctx === 'object');
  assert(typeof S === 'object');
  assert(typeof bt === 'object');
  assert(typeof c === 'object');
  assert(c.length < 1e7);
  const y = S.y0;
  return ctx.scene.objects.some((o) => {
    assert(typeof o === 'object');
    const b = bt[o.id], m = ctx.models.get(o.model);
    if (!b || o.id === S.o.id || o.model === 'person' || !inPoly(c, b.corners)) return false;
    if ((o.tags || []).includes('stairs') || (m?.tags || []).includes('stairs') || o.model === 'escalator') return y >= b.min[1] - 0.05 && y <= b.max[1] + 0.05;
    return Math.abs(b.max[1] - y) <= 0.1;
  });
}
function groundAt(ctx: MotionCtx, t: number, S: Solid, bt: Record<string, ObjectBounds>): void {
  assert(typeof ctx === 'object');
  assert(typeof t === 'number');
  assert(typeof S === 'object');
  assert(typeof bt === 'object');
  assert(!Number.isNaN(t));
  for (const b of ctx.osm) if (S.box[2] > b.box[0] && S.box[0] < b.box[2] && S.box[3] > b.box[1] && S.box[1] < b.box[3] && S.y0 < b.y1 && inFootprint(S, b.poly))
    ctx.seen(`c|${S.o.id}|${b.id}`, t, (r) => {
      assert(typeof r === 'object');
      return `${S.o.id} is inside the building ${b.id} from ${r.t0.toFixed(2)} s to ${r.t1.toFixed(2)} s. Keep people and vehicles out of building footprints.`;
    });
  // ground contact: the ground (y 0), or the top of a floor, a structure or furniture under the centre
  const y = S.y0, c: Vec2 = [S.b.at[0], S.b.at[2]];
  if (Math.abs(y) > 0.05 && !heldUp(ctx, S, bt, c)) ctx.seen(`g|${S.o.id}`, t, (r) => `${S.o.id} ${y > 0 ? 'floats above' : 'sinks into'} the ground from ${r.t0.toFixed(2)} s to ${r.t1.toFixed(2)} s (y ${y.toFixed(2)} m). Put it on the ground, a floor or stairs.`);
}
// lanes: a driving vehicle on a straight road keeps to the side of the road given by scene.drive
function laneAt(ctx: MotionCtx, t: number, S: Solid, bt: Record<string, ObjectBounds>, before: ObjectBounds): void {
  assert(typeof ctx === 'object');
  assert(typeof t === 'number');
  assert(typeof S === 'object');
  assert(typeof bt === 'object');
  assert(typeof before === 'object');
  assert(!Number.isNaN(t));
  const { drive } = ctx;
  const a = before.at, v: Vec2 = [S.b.at[0] - a[0], S.b.at[2] - a[2]], sp = Math.hypot(...v) / VIEW_STEP;
  const road = sp >= MIN_SPEED ? ctx.roads.find((r) => { 
    assert(typeof r === 'object');
    const rb = bt[r.id]; return rb && inPoly(c2(S.b.at), rb.corners); }) : undefined;
  const rb = road && bt[road.id];
  if (!road || !rb) return;
  const ax = rotYaw([0, 0, 1], rb.yaw), along = v[0] * ax[0] + v[1] * ax[2];
  const dir: Vec2 = along >= 0 ? [ax[0], ax[2]] : [-ax[0], -ax[2]], right: Vec2 = [-dir[1], dir[0]];
  const side = (S.b.at[0] - rb.at[0]) * right[0] + (S.b.at[2] - rb.at[2]) * right[1];
  if (Math.abs(along) > 0.5 * Math.hypot(...v) && (drive === 'left' ? side > 0.3 : side < -0.3))
    ctx.seen(`l|${S.o.id}`, t, (r) => `${S.o.id} drives on the ${drive === 'left' ? 'right' : 'left'} side of ${road.id} from ${r.t0.toFixed(2)} s to ${r.t1.toFixed(2)} s. Traffic keeps ${drive} (scene drive "${drive}"): move the path to the ${drive} lane for its direction.`);
}
function solidsStep(ctx: MotionCtx, t: number, solids: Solids, bt: Record<string, ObjectBounds>, prev: Record<string, ObjectBounds> | null): void {
  assert(typeof ctx === 'object');
  assert(typeof t === 'number');
  assert(typeof solids === 'object');
  assert(typeof bt === 'object');
  assert(!Number.isNaN(t));
  assert(solids.length < 1e7);
  collisionsAt(ctx, t, solids);
  for (const S of solids) {
    if (!mineOf(ctx, S)) continue;
    if (S.kind === 'person' || S.kind === 'vehicle') groundAt(ctx, t, S, bt);
    const before = prev?.[S.o.id];
    if (S.kind === 'vehicle' && ctx.movers.has(S.o.id) && before) laneAt(ctx, t, S, bt, before);
  }
}
// [{ code, path, message }] for collision (two solids pass into each other), off_ground (a person or a
// vehicle floats or sinks) and wrong_lane (a driving vehicle is on the wrong side of the road). Each
// problem is reported once, with the time span in which it holds.
export function motionErrors(scene: Scene, catalogue?: Catalogue | null, opts: { only?: Iterable<string> | null; from?: number; to?: number } = {}): ValidationError[] {
  assert(typeof scene === 'object');
  const cat = catalogue || loadCatalogue(), models = new Map(cat.models.map((m): [string, Model] => [m.id, m]));
  const runs = new Map<string, Run[]>();
  const seen = (key: string, t: number, make: (r: Run) => string): void => {
    assert(typeof key === 'string');
    assert(typeof t === 'number');
    assert(typeof make === 'function');
    assert(key.length < 1e7);
    assert(!Number.isNaN(t));
    let rs = runs.get(key);
    if (!rs) { rs = []; runs.set(key, rs); }
    const r = rs.at(-1);
    if (r && t - r.t1 <= VIEW_STEP + 1e-9) r.t1 = t; else rs.push({ t0: t, t1: t, make });
  };
  const ctx: MotionCtx = {
    scene, models, seen, drive: scene.drive || 'left',
    movers: new Set((scene.tracks || []).filter((k) => MOVE_CHANNELS.has(k.channel)).map((k) => k.object)),
    only: opts.only ? new Set(opts.only) : null,
    osm: (scene.map?.osm?.buildings || []).map((b) => prism(`osm:${b.id}`, b.poly, 0, b.height || 9)),
    roads: scene.objects.filter((o) => ['road-straight', 'road-zebra'].includes(o.model) && !o.parent),
  };
  const t0 = opts.from ?? 0, t1 = opts.to ?? scene.duration ?? 0, n = Math.max(0, Math.round((t1 - t0) / VIEW_STEP));
  let prev: Record<string, ObjectBounds> | null = null;
  for (let k = 0; k <= n; k++) {
    const t = Math.min(t1, t0 + k * VIEW_STEP), { bt, solids } = solidsAt(scene, cat, models, t);
    solidsStep(ctx, t, solids, bt, prev);
    prev = bt;
  }
  const errs: ValidationError[] = [];
  for (const [key, rs] of runs) for (const r of rs) errs.push({ code: RUN_CODES[key.charAt(0)] ?? 'collision', path: 'objects', message: r.make(r) });
  return errs;
}
const c2 = (at: Vec3): Vec2 => [at[0], at[2]];

// ---------- contrast
function lum(hex: string): number {
  assert(typeof hex === 'string');
  assert(hex.length < 1e7);
  const h = hex.replace('#', '');
  const f = h.length === 3 ? h.split('').map((c) => {
    assert(typeof c === 'string');
    assert(c.length < 1e7);
    const returned = c + c;
    assert(typeof returned === 'string');
    assert(returned.length < 1e7);
    return returned;
  }).join('') : h;
  const ch = (i: number): number => { 
    assert(typeof i === 'number');
    assert(!Number.isNaN(i));
    const c = parseInt(f.slice(i, i + 2), 16) / 255; const returned = c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  assert(typeof returned === 'number');
  return returned; };
  const returned = 0.2126 * ch(0) + 0.7152 * ch(2) + 0.0722 * ch(4);
  assert(typeof returned === 'number');
  return returned;
}
export function contrastRatio(a: string, b: string): number { 
  assert(typeof a === 'string');
  assert(typeof b === 'string');
  assert(a.length < 1e7);
  assert(b.length < 1e7);
  const la = lum(a), lb = lum(b), x = Math.max(la, lb), y = Math.min(la, lb); const returned = (x + 0.05) / (y + 0.05);
assert(typeof returned === 'number');
return returned; }
export function contrast_ok(a: string, b: string): boolean { 
  assert(typeof a === 'string');
  assert(typeof b === 'string');
  assert(a.length < 1e7);
  assert(b.length < 1e7);
  return contrastRatio(a, b) >= 4.5; }

// ---------- SRT
function ts(sec: number): string {
  assert(typeof sec === 'number');
  assert(!Number.isNaN(sec));
  const ms = Math.round(Math.max(0, sec) * 1000);   // a bad negative time must never make an invalid .srt
  const p = (n: number, w: number): string => {
    assert(typeof n === 'number');
    assert(typeof w === 'number');
    assert(!Number.isNaN(n));
    assert(!Number.isNaN(w));
    const returned = String(n).padStart(w, '0');
    assert(typeof returned === 'string');
    assert(returned.length < 1e7);
    return returned;
  };
  const returned = `${p(Math.floor(ms / 3600000), 2)}:${p(Math.floor(ms / 60000) % 60, 2)}:${p(Math.floor(ms / 1000) % 60, 2)},${p(ms % 1000, 3)}`;
  assert(typeof returned === 'string');
  assert(returned.length < 1e7);
  return returned;
}
export function srt(scene: Scene): string {
  assert(typeof scene === 'object');
  return [...(scene.captions || [])].sort((a, b) => {
    assert(typeof a === 'object');
    assert(typeof b === 'object');
    const returned = a.start - b.start;
    assert(typeof returned === 'number');
    return returned;
  })
    .map((c, i) => {
      assert(typeof c === 'object');
      assert(typeof i === 'number');
      assert(!Number.isNaN(i));
      const returned = `${i + 1}\n${ts(c.start)} --> ${ts(c.end)}\n${plain(c.text)}\n`;
      assert(typeof returned === 'string');
      assert(returned.length < 1e7);
      return returned;
    }).join('\n');
}

// ---------- validation
export const HARD_CODES = new Set<string>(['schema', 'unknown_model', 'below_ground', 'overlap', 'time_backwards', 'caption_too_long', 'caption_too_short_on_screen',
  'caption_overlap', 'shot_move_too_long', 'measured_no_source', 'estimate_not_flagged', 'duplicate_id', 'unknown_object', 'fact_no_source', 'unknown_fact', 'bad_cue']);

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isVec = (v: unknown, n = 3): boolean => Array.isArray(v) && v.length === n && v.every(isNum);
const isHex = (v: unknown): boolean => typeof v === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v);

interface V {
  scene: Scene; cat: Catalogue; models: Map<string, Model>; ids: Set<unknown>; errs: ValidationError[];
  E: (code: string, path: string, message: string) => void; seeT: (t: unknown) => void; maxT: number;
}
function sceneOf(raw: Scene, E: V['E']): Scene {
  // A list that is not an array is reported and then read as an empty list.
  assert(typeof raw === 'object');
  assert(typeof E === 'function');
  const list = <T>(k: string, v: T[] | undefined): T[] => {
    assert(typeof k === 'string');
    assert(k.length < 1e7);
    if (!Array.isArray(v)) { E('schema', k, `${k} must be an array.`); return []; }
    return v;
  };
  return { ...raw, objects: list('objects', raw.objects), tracks: list('tracks', raw.tracks), camera: list('camera', raw.camera),
    chapters: list('chapters', raw.chapters), captions: list('captions', raw.captions), callouts: list('callouts', raw.callouts) };
}
function checkTop(v: V): void {
  assert(typeof v === 'object');
  const { scene, E } = v;
  if (!isNum(scene.duration) || scene.duration < 0) E('schema', 'duration', 'duration must be a number of seconds.');
  if (scene.backdrop && !oneOf(GROUNDS, scene.backdrop.ground)) E('schema', 'backdrop.ground', `ground must be one of ${GROUNDS.join(', ')}.`);
  if (scene.backdrop?.ground === 'map' && scene.map?.bearing) E('schema', 'map.bearing', 'OneMap tiles cannot turn. Use a ground other than "map" when the map has a bearing.');
  if (scene.lighting !== undefined && !Array.isArray(scene.lighting)) E('schema', 'lighting', 'lighting must be an array.');
}
function checkObjects(v: V): void {
  assert(typeof v === 'object');
  const { scene, cat, models, ids, E } = v;
  scene.objects.forEach((o, i) => {
    assert(typeof o === 'object');
    assert(typeof i === 'number');
    assert(!Number.isNaN(i));
    const p = `objects[${i}]`;
    if (!o || typeof o.id !== 'string' || !o.id) { E('schema', p, 'Object needs a string id.'); return; }
    if (ids.has(o.id)) E('duplicate_id', p, `Duplicate object id ${o.id}.`);
    ids.add(o.id);
    if (typeof o.model !== 'string') E('schema', `${p}.model`, 'model must be a string.');
    else if (o.model !== 'person' && !models.has(o.model)) E('unknown_model', `${p}.model`, `Unknown model "${o.model}". Use list_models.`);
    if (!isVec(o.at)) E('schema', `${p}.at`, 'at must be [x, y, z].');
    if (o.yaw !== undefined && !isNum(o.yaw)) E('schema', `${p}.yaw`, 'yaw must be a number.');
    if (o.scale !== undefined && !isVec(o.scale)) E('schema', `${p}.scale`, 'scale must be [x, y, z].');
    if (o.colors) for (const [k, v] of Object.entries(o.colors)) if (!isHex(v)) E('schema', `${p}.colors.${k}`, 'Colour must be a hex string.');
    if (o.model === 'person') {
      if (!Number.isInteger(o.variant ?? 0) || (o.variant ?? 0) < 0 || (o.variant ?? 0) > 23) E('schema', `${p}.variant`, 'Person variant must be 0 to 23.');
      if (o.colors) for (const k of Object.keys(o.colors)) if (!['shirt', 'pants'].includes(k)) E('schema', `${p}.colors.${k}`, 'A person uses the slots shirt and pants only.');
      if (o.outfit !== undefined && !(cat.outfits || []).some((f) => f.id === o.outfit)) E('schema', `${p}.outfit`, `Unknown outfit "${o.outfit}". Outfits: ${(cat.outfits || []).map((f) => f.id).join(', ')}.`);
    }
    if (o.pose !== undefined && !oneOf(POSES, o.pose)) E('schema', `${p}.pose`, `pose must be one of ${POSES.join(', ')}.`);
    if (o.tags !== undefined && !Array.isArray(o.tags)) E('schema', `${p}.tags`, 'tags must be an array.');
    if (o.parent && !scene.objects.some((q) => q.id === o.parent)) E('unknown_object', `${p}.parent`, `Parent ${o.parent} does not exist.`);
    if (o.measured === true && !o.source) E('measured_no_source', p, `Object ${o.id} is measured but has no source.`);
    if (typeof o.source === 'string' && /^estimated/i.test(o.source) && o.estimated !== true) E('estimate_not_flagged', p, `Object ${o.id} has an estimated source but estimated is not true.`);
  });
}

function checkTracks(v: V): void {
  assert(typeof v === 'object');
  const { scene, ids, E, seeT } = v;
  scene.tracks.forEach((tr, i) => {
    assert(typeof tr === 'object');
    assert(typeof i === 'number');
    assert(!Number.isNaN(i));
    const p = `tracks[${i}]`;
    if (!ids.has(tr.object)) E('unknown_object', `${p}.object`, `Track object ${tr.object} does not exist.`);
    if (!oneOf(CHANNELS, tr.channel)) E('schema', `${p}.channel`, `channel must be one of ${CHANNELS.join(', ')}.`);
    if (!Array.isArray(tr.keys) || !tr.keys.length) { E('schema', `${p}.keys`, 'keys must be a non-empty array.'); return; }
    tr.keys.forEach((k, j) => {
      assert(typeof k === 'object');
      assert(typeof j === 'number');
      assert(!Number.isNaN(j));
      const kp = `${p}.keys[${j}]`;
      if (!isNum(k.t) || k.t < 0) E('schema', `${kp}.t`, 't must be a number of seconds >= 0.');
      else seeT(k.t);
      if (k.ease !== undefined && !oneOf(EASES, k.ease)) E('schema', `${kp}.ease`, `ease must be one of ${EASES.join(', ')}.`);
      const ok = tr.channel === 'at' ? isVec(k.v) : tr.channel === 'yaw' ? isNum(k.v) : tr.channel === 'scale' ? (isNum(k.v) || isVec(k.v)) : oneOf(POSES, k.v);
      if (!ok) E('schema', `${kp}.v`, `Bad value for channel ${tr.channel}.`);
      const pk = tr.keys[j - 1];
      if (j > 0 && pk && isNum(k.t) && k.t <= pk.t) E('time_backwards', kp, `Key time ${k.t} is not after ${pk.t}.`);
    });
  });
}

function checkCamera(v: V): void {
  assert(typeof v === 'object');
  const { scene, E, seeT } = v;
  scene.camera.forEach((k, i) => {
    assert(typeof k === 'object');
    assert(typeof i === 'number');
    assert(!Number.isNaN(i));
    const p = `camera[${i}]`;
    if (!isNum(k.t) || k.t < 0) E('schema', `${p}.t`, 't must be a number of seconds >= 0.'); else seeT(k.t);
    if (!oneOf(SHOTS, k.shot)) E('schema', `${p}.shot`, `shot must be one of ${SHOTS.join(', ')}.`);
    if (!isVec(k.eye)) E('schema', `${p}.eye`, 'eye must be [x, y, z].');
    if (!isVec(k.target)) E('schema', `${p}.target`, 'target must be [x, y, z].');
    if (k.fov !== undefined && (!isNum(k.fov) || k.fov < 10 || k.fov > 120)) E('schema', `${p}.fov`, 'fov must be 10 to 120 degrees.');
    const pk = scene.camera[i - 1];
    if (i > 0 && pk && isNum(k.t) && k.t <= pk.t) E('time_backwards', p, `Camera key time ${k.t} is not after ${pk.t}.`);
    if (i > 0 && pk && isNum(k.t) && k.shot !== pk.shot && pk.ease !== 'step' && k.t - pk.t > MAX_SHOT_MOVE + 1e-9)
      E('shot_move_too_long', p, `Camera moves from ${pk.shot} to ${k.shot} over ${(k.t - pk.t).toFixed(2)} s. Use at most ${MAX_SHOT_MOVE} s, or cut (ease "step" on the earlier key).`);
  });
}

function checkLighting(v: V): void {
  assert(typeof v === 'object');
  const { scene, E, seeT } = v;
  const lights = Array.isArray(scene.lighting) ? scene.lighting : [];
  lights.forEach((l, i) => {
    assert(typeof l === 'object');
    assert(typeof i === 'number');
    assert(!Number.isNaN(i));
    if (!oneOf(LOOKS, l.look)) E('schema', `lighting[${i}].look`, `look must be one of ${LOOKS.join(', ')}.`);
    if (!isNum(l.t)) E('schema', `lighting[${i}].t`, 't must be a number.'); else seeT(l.t);
    const pl = lights[i - 1];
    if (i > 0 && pl && isNum(l.t) && l.t <= pl.t) E('time_backwards', `lighting[${i}]`, 'Lighting times must increase.');
  });
}

function checkChapters(v: V): void {
  assert(typeof v === 'object');
  const { scene, ids, E, seeT } = v;
  let prevEnd = -Infinity;
  scene.chapters.forEach((c, i) => {
    assert(typeof c === 'object');
    assert(typeof i === 'number');
    assert(!Number.isNaN(i));
    const p = `chapters[${i}]`;
    if (!isNum(c.start) || !isNum(c.end)) { E('schema', p, 'Chapter needs numeric start and end.'); return; }
    seeT(c.end);
    if (c.start < 0 || c.end < 0) E('schema', p, 'Chapter start and end must be 0 or more seconds.');
    if (c.end <= c.start) E('time_backwards', p, `Chapter ends (${c.end}) before it starts (${c.start}).`);
    if (c.start < prevEnd - 1e-9) E('time_backwards', p, `Chapter starts at ${c.start}, before the previous chapter ends at ${prevEnd}.`);
    prevEnd = c.end;
    if (c.shot !== undefined && !oneOf(SHOTS, c.shot)) E('schema', `${p}.shot`, `shot must be one of ${SHOTS.join(', ')}.`);
    const hasCap = (typeof c.caption === 'string' && c.caption.trim()) || scene.captions.some((x) => x.start < c.end && x.end > c.start);
    if (!hasCap) E('chapter_no_caption', p, `Chapter ${c.id} has no caption.`);
    if (c.measured === true && !c.source) E('measured_no_source', p, `Chapter ${c.id} is measured but has no source.`);
    if (typeof c.source === 'string' && /^estimated/i.test(c.source) && c.estimated !== true) E('estimate_not_flagged', p, `Chapter ${c.id} has an estimated source but estimated is not true.`);
    for (const f of c.focus || []) if (!ids.has(f)) E('unknown_object', `${p}.focus`, `Focus object ${f} does not exist.`);
  });
}

function checkCaptions(v: V): void {
  assert(typeof v === 'object');
  const { scene, E, seeT } = v;
  const capsSorted = [...scene.captions].sort((a, b) => {
    assert(typeof a === 'object');
    assert(typeof b === 'object');
    const returned = a.start - b.start;
    assert(typeof returned === 'number');
    return returned;
  });
  scene.captions.forEach((c, i) => {
    assert(typeof c === 'object');
    assert(typeof i === 'number');
    assert(!Number.isNaN(i));
    const p = `captions[${i}]`;
    if (!isNum(c.start) || !isNum(c.end) || typeof c.text !== 'string') { E('schema', p, 'Caption needs start, end and text.'); return; }
    seeT(c.end);
    if (c.start < 0 || c.end < 0) E('schema', p, 'Caption start and end must be 0 or more seconds.');
    if (c.end <= c.start) E('time_backwards', p, `Caption ends (${c.end}) before it starts (${c.start}).`);
    const chars = plain(c.text).length;
    if (chars > MAX_CAPTION) E('caption_too_long', p, `Caption has ${chars} characters. The limit is ${MAX_CAPTION}.`);
    const need = chars * MIN_SEC_PER_CHAR;
    if (c.end - c.start + 1e-9 < need) E('caption_too_short_on_screen', p, `Caption shows for ${(c.end - c.start).toFixed(2)} s but needs ${need.toFixed(2)} s (${MIN_SEC_PER_CHAR} s per character).`);
  });
  for (let i = 1; i < capsSorted.length; i++) {
    const cur = capsSorted[i], before = capsSorted[i - 1];
    if (cur && before && cur.start < before.end - 1e-9) E('caption_overlap', `captions[${scene.captions.indexOf(cur)}]`, 'Captions overlap in time.');
  }
}

function checkCallouts(v: V): void {
  assert(typeof v === 'object');
  const { scene, ids, E, seeT } = v;
  scene.callouts.forEach((c, i) => {
    assert(typeof c === 'object');
    assert(typeof i === 'number');
    assert(!Number.isNaN(i));
    const p = `callouts[${i}]`;
    if (!isNum(c.start) || !isNum(c.end)) { E('schema', p, 'Callout needs start and end.'); return; }
    seeT(c.end);
    if (c.start < 0 || c.end < 0) E('schema', p, 'Callout start and end must be 0 or more seconds.');
    if (c.end <= c.start) E('time_backwards', p, 'Callout ends before it starts.');
    if (c.object && !ids.has(c.object)) E('unknown_object', `${p}.object`, `Callout object ${c.object} does not exist.`);
    if (c.measured === true && !c.source) E('measured_no_source', p, 'Callout is measured but has no source.');
    if (typeof c.source === 'string' && /^estimated/i.test(c.source) && c.estimated !== true) E('estimate_not_flagged', p, 'Callout has an estimated source but estimated is not true.');
  });
  // a callout belongs to one chapter: it shows only inside that chapter
  if (scene.chapters.length) scene.callouts.forEach((c, i) => {
    assert(typeof c === 'object');
    assert(typeof i === 'number');
    assert(!Number.isNaN(i));
    if (isNum(c.start) && isNum(c.end) && !scene.chapters.some((k) => c.start >= k.start - 1e-9 && c.end <= k.end + 1e-9))
      E('callout_outside_chapter', `callouts[${i}]`, `Callout "${c.text}" (${c.start} s to ${c.end} s) is not inside one chapter. A callout shows only in the chapter that it belongs to.`);
  });
}

function checkMotions(v: V): void {
  assert(typeof v === 'object');
  const { scene, ids, E, seeT } = v;
  // motions: words such as pop and hop (engine/vid.goose)
  if (scene.motions !== undefined && !Array.isArray(scene.motions)) E('schema', 'motions', 'motions must be an array.');
  (Array.isArray(scene.motions) ? scene.motions : []).forEach((m, i) => {
    assert(typeof m === 'object');
    assert(typeof i === 'number');
    assert(!Number.isNaN(i));
    const p = `motions[${i}]`;
    if (!ids.has(m.object)) E('unknown_object', `${p}.object`, `Motion object ${m.object} does not exist.`);
    if (!oneOf(MOVES, m.move)) E('schema', `${p}.move`, `move must be one of ${MOVES.join(', ')}.`);
    if (!isNum(m.t) || m.t < 0) E('schema', `${p}.t`, 't must be a number of seconds >= 0.'); else seeT(motionEnd(m));
    if (m.d !== undefined && !(isNum(m.d) && m.d > 0)) E('schema', `${p}.d`, 'd must be more than 0 seconds.');
    for (const k of ['h', 'x', 'y', 'deg'] as const) if (m[k] !== undefined && !isNum(m[k])) E('schema', `${p}.${k}`, `${k} must be a number.`);
  });
}

function checkDuration(v: V): void {
  assert(typeof v === 'object');
  const { scene, E, seeT } = v;
  v.errs.push(...narrationErrors(scene));
  // The voice is content too: the last sentence end and the tail after it must fit in duration,
  // even when a bad scene file has no captions to carry the narration length.
  for (const n of Array.isArray(scene.narration) ? scene.narration : []) seeT(n.end);
  seeT(narrationLength(scene.narration));
  if (isNum(scene.duration) && scene.duration < v.maxT - 5e-4) E('duration_too_short', 'duration', `duration is ${scene.duration} s but the last time in the scene is ${v.maxT} s.`);

  if (scene.chapters.length >= 12) {
    const shots = new Set([...scene.chapters.map((c) => c.shot), ...scene.camera.map((k) => k.shot)].filter(Boolean));
    if (shots.size < 3) E('too_few_shot_types', 'camera', `A scene with ${scene.chapters.length} chapters needs at least 3 shot types. It has ${shots.size}.`);
  }
}

function checkGeometry(v: V): void {
  assert(typeof v === 'object');
  const { scene, cat, models, E } = v;
  // geometry checks need valid models
  const bounds = objectBounds(scene, cat, 0);
  scene.objects.forEach((o, i) => {
    assert(typeof o === 'object');
    assert(typeof i === 'number');
    assert(!Number.isNaN(i));
    const b = bounds[o.id];
    if (b && b.min[1] < -0.01) E('below_ground', `objects[${i}]`, `Object ${o.id} reaches y=${b.min[1].toFixed(2)} m, below the ground.`);
  });
  const movers = new Set(scene.tracks.filter((t) => t.channel === 'at' || t.channel === 'scale').map((t) => t.object));
  const cand = scene.objects.filter((o) => bounds[o.id] && !o.hidden && !o.parent && !movers.has(o.id)
    && !(o.tags || []).some((t) => STRUCTURAL_TAGS.includes(t)) && models.get(o.model)?.kind !== 'road' && o.pose !== 'sit');
  for (let a = 0; a < cand.length; a++) for (let b = a + 1; b < cand.length; b++) {
    const A = cand[a], B = cand[b];
    if (!A || !B) continue;
    if (A.model === 'person' && B.model === 'person') continue;
    const ba = bounds[A.id], bb = bounds[B.id];
    if (!ba || !bb) continue;
    if (ba.min[0] >= bb.max[0] || bb.min[0] >= ba.max[0] || ba.min[2] >= bb.max[2] || bb.min[2] >= ba.max[2]) continue;
    if (ba.min[1] >= bb.max[1] || bb.min[1] >= ba.max[1]) continue; // stacked in height, no overlap
    const ratio = overlapRatio(ba.corners, bb.corners);
    if (ratio > 0.2) E('overlap', `objects[${scene.objects.indexOf(B)}]`, `Objects ${A.id} and ${B.id} overlap by ${(ratio * 100).toFixed(0)} percent of the smaller footprint.`);
  }
}

function checkVanishing(v: V): void {
  assert(typeof v === 'object');
  const { scene, models, E } = v;
  // real objects stay in the scene: nothing is hidden, and no building, structure or vehicle disappears
  // to clear a camera view. A vehicle may be swapped for another one (a car that burns) at the same place.
  scene.objects.forEach((o, i) => { 
    assert(typeof o === 'object');
    assert(typeof i === 'number');
    assert(!Number.isNaN(i));
    if (o.hidden) E('object_hidden', `objects[${i}]`, `Object ${o.id} is hidden. Do not hide an object to clear a view: move the camera. Remove an object only when it does not belong in the scene.`); });
  const kindOf = (o: SceneObject): string | undefined => models.get(o.model)?.kind;
  const tiny = (v: TrackValue | undefined): boolean => (typeof v === 'number' ? v < 0.05 : Array.isArray(v) && Math.min(...v) < 0.05);
  const changes = (o: SceneObject, grow: boolean): number[] => (trackOf(scene, o.id, 'scale')?.keys || []).filter((k, j, ks) => {
    assert(typeof k === 'object');
    assert(typeof j === 'number');
    assert(typeof ks === 'object');
    assert(!Number.isNaN(j));
    assert(ks.length < 1e7);
    return j > 0 && tiny(ks[j - 1]?.v) === grow && tiny(k.v) !== grow;
  }).map((k) => k.t);
  scene.objects.forEach((o, i) => {
    assert(typeof o === 'object');
    assert(typeof i === 'number');
    assert(!Number.isNaN(i));
    const kind = kindOf(o);
    if (!kind || !['building', 'structure', 'vehicle'].includes(kind)) return;
    const first = trackOf(scene, o.id, 'scale')?.keys?.[0];
    if ((scene.motions || []).some((m) => m.object === o.id && (m.move === 'pop' || m.move === 'out')))
      E('object_vanishes', `objects[${i}]`, `${kind.charAt(0).toUpperCase()}${kind.slice(1)} ${o.id} has a pop or an out motion. A real object does not appear from nothing or disappear.`);
    if (kind !== 'vehicle' && ((o.scale !== undefined && tiny(o.scale)) || (first && tiny(first.v))))
      E('object_vanishes', `objects[${i}]`, `${kind.charAt(0).toUpperCase()}${kind.slice(1)} ${o.id} is too small to see (scale below 0.05). A real object does not disappear: move the camera to clear a view.`);
    for (const t of changes(o, false)) {
      const here = stateAt(scene, o, t - 0.01).at;
      const swap = kind === 'vehicle' && scene.objects.some((q) => q !== o && kindOf(q) === 'vehicle'
        && changes(q, true).some((u) => Math.abs(u - t) <= 1 && Math.hypot(stateAt(scene, q, u + 0.01).at[0] - here[0], stateAt(scene, q, u + 0.01).at[2] - here[2]) <= 3));
      if (!swap) E('object_vanishes', `objects[${i}]`, `${kind.charAt(0).toUpperCase()}${kind.slice(1)} ${o.id} shrinks to nothing at ${t} s. A real object does not disappear: move the camera to clear a view. Only a vehicle may be swapped for another vehicle at the same place and time.`);
    }
  });
  if (scene.cutaway) scene.objects.forEach((o, i) => {
    assert(typeof o === 'object');
    assert(typeof i === 'number');
    assert(!Number.isNaN(i));
    if ((o.tags || []).some((t) => t === 'wall' || t === 'ceiling') && ['building', 'vehicle', 'nature'].includes(kindOf(o) ?? ''))
      E('cutaway_outdoor', `objects[${i}].tags`, `${o.id} is a ${kindOf(o)} with a wall or ceiling tag, so the cutaway hides it. The cutaway is for room walls and ceilings from build_room only.`);
  });
}

function checkFocus(v: V): void {
  assert(typeof v === 'object');
  const { scene, cat, E } = v;
  // focus visibility at chapter start
  scene.chapters.forEach((c, i) => {
    assert(typeof c === 'object');
    assert(typeof i === 'number');
    assert(!Number.isNaN(i));
    if (!c.focus?.length || !isNum(c.start)) return;
    const cam = cameraAt(scene, c.start);
    if (!cam) return;
    const bt = objectBounds(scene, cat, c.start);
    for (const f of c.focus) {
      const o = scene.objects.find((x) => x.id === f);
      if (!o) continue;
      if (o.hidden) { E('focus_out_of_view', `chapters[${i}].focus`, `Focus object ${f} is hidden.`); continue; }
      const fb = bt[f];
      if (fb && !boundsVisible(cam, fb)) E('focus_out_of_view', `chapters[${i}].focus`, `Focus object ${f} is outside the camera view at ${c.start} s.`);
    }
  });
}

export function validate(raw: Scene, catalogue?: Catalogue | null): ValidationError[] {
  assert(typeof raw === 'object');
  const cat = catalogue || loadCatalogue();
  const errs: ValidationError[] = [];
  const E: V['E'] = (code, path, message) => { 
    assert(typeof code === 'string');
    assert(typeof path === 'string');
    assert(typeof message === 'string');
    assert(code.length < 1e7);
    assert(path.length < 1e7);
    assert(message.length < 1e7);
    errs.push({ code, path, message }); };
  if (!raw || typeof raw !== 'object') { E('schema', '', 'Scene is not an object.'); return errs; }
  if (raw.toybox !== FORMAT) E('schema', 'toybox', `toybox must be ${FORMAT}.`);
  const scene = sceneOf(raw, E);
  const v: V = { scene, cat, errs, E, models: new Map(cat.models.map((m): [string, Model] => [m.id, m])), ids: new Set(), maxT: 0,
    seeT: (t) => { 
      if (isNum(t) && t > v.maxT) v.maxT = t; } };
  checkTop(v);
  for (const check of [checkObjects, checkTracks, checkCamera, checkLighting, checkChapters, checkCaptions, checkCallouts, checkMotions, checkDuration, checkGeometry, checkVanishing, checkFocus]) check(v);
  return errs;
}

// Every check: validate, blocked views and motion. The validate tool, export_scene and the eval report use it.
export function checkScene(scene: Scene, catalogue?: Catalogue | null): ValidationError[] {
  assert(typeof scene === 'object');
  const cat = catalogue || loadCatalogue();
  return [...validate(scene, cat), ...blockedViews(scene, cat), ...motionErrors(scene, cat)];
}

// Colours the export uses for caption text and its plate. The eval checks their contrast.
export const CAPTION_STYLE = { fg: '#ffffff', bg: '#22272f' };
