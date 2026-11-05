// The Toybox viewer: loads the Goose engine (WebAssembly), feeds it a scene file, draws the
// text overlays, and handles the camera, picking and per-object edits. The authoring app and
// the hosted viewer use this same module. The canvas must have the id "canvas" (the engine
// finds it by that id).
import { poseAt, seedOf, marks } from './vid.js';
import { context2d, isRecord, orEmpty } from './dom.js';
import { isCatalogue } from './format.js';

// ---------------------------------------------------------------- types
import type { Vec2, Vec3, Scene, SceneObject, Model, Outfit, Catalogue, Motion, OsmBuilding, SceneMap, TrackValue } from './types.js';
import { assert } from './assert.ts';
export type { Vec2, Vec3, Scene, SceneObject, Model, Outfit, Catalogue, Motion };
// NEED-TYPE: Callout.at, Callout.estimated, Chapter.estimated, Model.mesh, Model.groups (the viewer reads them through guards below).

// The guards check the outer shape of data that comes from outside (fetch, a file, the undo list).
export function isScene(x: unknown): x is Scene {
  return isRecord(x) && Array.isArray(x.objects);
}
// Fields that the scene format allows but web/types.ts does not name yet.
function flag(x: object, key: string): boolean { 
  assert(typeof key === 'string');
  assert(key.length < 1e7);
  return isRecord(x) && x[key] === true; }
function vec3Of(x: unknown): Vec3 | undefined {
  if (!Array.isArray(x) || x.length !== 3) return undefined;
  const a: unknown = x[0], b: unknown = x[1], c: unknown = x[2];
  return typeof a === 'number' && typeof b === 'number' && typeof c === 'number' ? [a, b, c] : undefined;
}
function numberOf(v: TrackValue): number { const returned = typeof v === 'number' ? v : 0;
assert(typeof returned === 'number');
return returned; }
interface Group { color: string; slot?: string }
function meshOf(m: Model): string | undefined { return typeof m.mesh === 'string' ? m.mesh : undefined; }
function groupsOf(m: Model): Group[] {
  const g = m.groups;
  return Array.isArray(g) ? g.filter((x): x is Group => isRecord(x) && typeof x.color === 'string') : [];
}
interface Skeleton { bones: { name: string; parent: number; head: Vec3 }[] }
function isSkeleton(x: unknown): x is Skeleton {
  return isRecord(x) && Array.isArray(x.bones) && x.bones.every(b => isRecord(b) && typeof b.name === 'string' && typeof b.parent === 'number' && Array.isArray(b.head));
}

// The engine (Goose compiled to WebAssembly by Emscripten): only the exports that the viewer calls.
export interface Engine {
  HEAPU8: Uint8Array; HEAPF32: Float32Array;
  _scene_init(w: number, h: number): void; _scene_resize(w: number, h: number): void; _scene_reset(): void;
  _skel_set(i: number, parent: number, x: number, y: number, z: number): void;
  _obj_add(prim: number, mesh: number, parent: number, flags: number, variant: number, pose: number, flip: number,
    x: number, y: number, z: number, yaw: number, rx: number, ry: number, rz: number, sx: number, sy: number, sz: number,
    r1: number, g1: number, b1: number, r2: number, g2: number, b2: number, shadow: number): number;
  _obj_bone(id: number, bone: number): void;
  _obj_pose(id: number, dx: number, up: number, tilt: number, sx: number, sz: number, spin: number, ez: number, eye: number, pivot: number): void;
  _obj_wx(id: number): number; _obj_wy(id: number): number; _obj_wz(id: number): number;
  _trk_begin(id: number, channel: number): void;
  _key_add(t: number, a: number, b: number, c: number, ease: number): void;
  _cam_add(t: number, ex: number, ey: number, ez: number, tx: number, ty: number, tz: number, fov: number, ease: number): void;
  _cam_user(on: number, yaw: number, pitch: number, dist: number, tx: number, ty: number, tz: number): void;
  _cam_x(): number; _cam_y(): number; _cam_z(): number;
  _light_add(t: number, look: number): void;
  _set_backdrop(ground: number, w: number, h: number, r: number, g: number, b: number): void;
  _set_cutaway(ceilings: number, nearWalls: number): void;
  _ground_map(on: number, x0: number, z0: number, x1: number, z1: number): void;
  _render_frame(t: number): void;
  _project(x: number, y: number, z: number): number; _proj_x(): number; _proj_y(): number;
  _toybox_up_buf(): number; _toybox_up_size(): number;
  _toybox_load_skin(id: number, nv: number, nt: number): void;
  _toybox_mesh_upload(id: number, n: number): void;
  _toybox_ground_upload(w: number, h: number): void;
  _toybox_read_pixels(): number;
}
declare function ToyboxModule(opts: { locateFile: (f: string) => string }): Promise<Engine>;   // from engine/toybox.js

export interface Orbit { yaw: number; pitch: number; dist: number; tx: number; ty: number; tz: number }
// An object with motions or a life of their own: id is the engine id.
export interface Posed { id: number; motions: Motion[]; seed: number | null; unit: number; pivot: number }
// The voice of one sentence.
export interface Clip { start: number; end: number; audio: HTMLAudioElement; on: boolean }
export interface ViewerOptions { canvas: HTMLCanvasElement; overlay?: HTMLCanvasElement | null; engineUrl?: string; assetsUrl?: string; width?: number; height?: number }

export interface Viewer {
  M: Engine; catalogue: Catalogue; models: Map<string, Model>;
  scene: Scene | null; t: number; playing: boolean; selected: string | null;
  userCam: boolean; orbit: Orbit; showOverlay: boolean; undo: string[];
  onchange: ((why: string) => void) | null; onframe: ((t: number) => void) | null; onedit: (() => void) | null;
  exporting: boolean;
  rootIds: Map<string, number>;   // object id -> engine id
  mapImage: boolean | null; logo: HTMLImageElement | null;
  posed: Posed[];
  voiceUrl: ((file: string) => string) | null;   // file -> URL of a voice file of the narration, or null for no sound
  clips: Clip[];
  tilesReady: Promise<void>;
  size(): Vec2;
  resize(w: number, h: number): void;
  sizeOf(o: { model: string }): Vec3;
  load(scene: Scene, keepTime?: boolean): void;
  oneMap(scene: Scene): boolean;
  loadLogo(): Promise<void>;
  project(x: number, y: number, z: number): Vec2 | null;
  draw(t: number): void;
  drawOverlay(ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void;
  camState(): { eye: Vec3 };
  orbitBy(dyaw: number, dpitch: number): void;
  zoomBy(f: number): void;
  panBy(dx: number, dy: number): void;
  storyCamera(): void;
  pick(px: number, py: number): string | null;
  select(id: string | null): void;
  groundPoint(px: number, py: number): Vec3 | null;
  undoEdit(): void;
  edit(op: 'move', arg: Vec2): void;
  edit(op: 'scale' | 'rotate', arg: number): void;
  edit(op: 'flip' | 'duplicate' | 'delete'): void;
  beginDrag(): void;
  moveSelectedTo(gx: number, gz: number): void;
  endDrag(): void;
  play(): void;
  pause(): void;
  seek(t: number): void;
  download(): void;
  readPixels(): Uint8Array;
}

// The element at index i of a list, or an error when there is none (a bad index is a defect, not data).
function nth<T>(list: readonly T[], i: number): T {
  assert(typeof list === 'object');
  assert(typeof i === 'number');
  assert(list.length < 1e7);
  assert(!Number.isNaN(i));
  const x = list[i];
  if (x === undefined) throw new RangeError(`viewer: no item at index ${i}`);
  return x;
}

const POSES: Record<string, number> = { stand: 0, walk: 1, run: 2, wave: 3, point: 4, cheer: 5, sit: 6, bend: 7 };
const LOOKS: Record<string, number> = { day: 0, dusk: 1, night: 2, indoor: 3 };
const EASE: Record<string, number> = { linear: 0, inout: 1, step: 2 };
const GROUND: Record<string, number> = { grass: 0, street: 1, floor: 2, plain: 3, map: 3 };
const PRIMS: Record<string, number> = { box: 0, cylinder: 1, sphere: 2, wedge: 3 };
const CHANNELS: Record<string, number> = { at: 0, yaw: 1, scale: 2, pose: 3 };
const FLAG = { hidden: 1, ceiling: 2, wall: 4, eye: 8 };
const PERSON_SIZE: Vec3 = [0.6, 1.7, 0.4];
const OSM_CREDIT = '© OpenStreetMap contributors';
const ONEMAP_CREDIT = 'OneMap © Singapore Land Authority';
const ONEMAP_LOGO = 'https://www.onemap.gov.sg/web-assets/images/logo/om_logo.png';
const SHIRTS = ['#3b5ea8', '#a84b3b', '#4b8a5a', '#c79a2e', '#7a4ea0', '#8a8f96', '#2f7f8f', '#b0507a'];
const PANTS = ['#2b2f4a', '#3a3a3a', '#4a3b2b', '#2f4a3b'];
const BONES = new Map<string, number>();   // bone name -> engine bone index

export function hexRGB(h?: string): Vec3 {
  const n = parseInt((h || '#808080').slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

// A sign label shows in every chapter, but a sign that a chapter lists in focus shows only in the
// chapters that list it.
export function signLabelShown(scene: Pick<Scene, 'chapters'>, id: string, t: number): boolean {
  assert(typeof scene === 'object');
  assert(typeof id === 'string');
  assert(typeof t === 'number');
  assert(id.length < 1e7);
  assert(!Number.isNaN(t));
  const cs = orEmpty(scene.chapters);
  if (!cs.some(c => (c.focus ?? []).includes(id))) return true;
  const c = cs.find(k => k.start <= t && t < k.end) ?? cs.find(k => k.start <= t && t <= k.end);
  return !!c && (c.focus ?? []).includes(id);
}
function loadScript(src: string): Promise<void> {
  assert(typeof src === 'string');
  assert(src.length < 1e7);
  return new Promise((ok, fail) => {
    assert(typeof ok === 'function');
    assert(typeof fail === 'function');
    const s = document.createElement('script');
    s.src = src; s.onload = () => { ok(); }; s.onerror = () => { fail(new Error('cannot load ' + src)); };
    document.head.appendChild(s);
  });
}

// The state that the viewer functions share. v is the public object; the rest is private.
interface Ctx {
  M: Engine; v: Viewer; w: number; h: number;
  overlay: HTMLCanvasElement | null | undefined; octx: CanvasRenderingContext2D | null;
  models: Map<string, Model>; outfits: Map<string, Outfit>;
  meshIds: Map<string, number[]>;   // imported model id -> engine mesh ids
  audios: Map<string, HTMLAudioElement>;   // URL -> Audio
  mapGeneration: number;   // raised at each scene load, so a slow tile load cannot repaint a newer scene
  dragFrame: number; last: number;
}
type EditOp = 'move' | 'scale' | 'rotate' | 'flip' | 'duplicate' | 'delete';

const FONT = '"DM Sans", system-ui, sans-serif';
const up = (c: Ctx): number => c.M._toybox_up_buf();

async function loadPeople(M: Engine, assetsUrl: string): Promise<void> {
  assert(typeof M === 'object');
  assert(typeof assetsUrl === 'string');
  assert(assetsUrl.length < 1e7);
  const sk: unknown = await (await fetch(`${assetsUrl}/people/skel.json`)).json();
  if (!isSkeleton(sk)) throw new Error('The skeleton file has no bones.');
  sk.bones.forEach((b, i) => { M._skel_set(i, b.parent, b.head[0], b.head[1], b.head[2]); });
  sk.bones.forEach((b, i) => BONES.set(b.name, i));
  const skins: [number, string][] = [[0, 'mesh_full.bin'], [1, 'mesh_lod.bin']];
  for (const [id, f] of skins) {
    const buf = new Uint8Array(await (await fetch(`${assetsUrl}/people/${f}`)).arrayBuffer());
    const [nv0 = 0, nv1 = 0] = new Uint32Array(buf.buffer, 0, 2);
    M.HEAPU8.set(buf.subarray(8), M._toybox_up_buf());
    M._toybox_load_skin(id, nv0, nv1);
  }
}

// Imported CC0 models (Kenney, Poly Haven): each colour group becomes one engine mesh, ids 16 to 511
// (0 to 3 are the primitives, 8 to 10 the map buildings, 512 is MAX_MESH in engine/gl_shim.h).
// File format: see tools/assets/import.ts.
async function loadMeshes(M: Engine, assetsUrl: string, catalogue: Catalogue): Promise<Map<string, number[]>> {
  assert(typeof M === 'object');
  assert(typeof assetsUrl === 'string');
  assert(typeof catalogue === 'object');
  assert(assetsUrl.length < 1e7);
  const meshIds = new Map<string, number[]>();
  const meshModels = catalogue.models.filter(m => meshOf(m));
  const files = await Promise.all(meshModels.map(async m => (await fetch(`${assetsUrl}/${meshOf(m)}`)).arrayBuffer()));
  let next = 16;
  meshModels.forEach((m, i) => {
    assert(typeof m === 'object');
    assert(typeof i === 'number');
    assert(!Number.isNaN(i));
    const buf = nth(files, i), head = new DataView(buf), g = head.getUint32(4, true), s = head.getFloat32(8, true);
    if (head.getUint32(0, true) !== 0x314d4254 || next + g > 512) return;
    const ids: number[] = [];
    let off = 12 + 4 * g;
    for (let k = 0; k < g; k++) {
      const n = head.getUint32(12 + 4 * k, true), q = new Int16Array(buf, off, n * 6), f = new Float32Array(n * 6);
      for (let j = 0; j < f.length; j++) f[j] = j % 6 < 3 ? (q[j] ?? 0) * s : (q[j] ?? 0) / 32767;
      off += n * 12;
      M.HEAPF32.set(f, M._toybox_up_buf() >> 2);
      M._toybox_mesh_upload(next, f.length);
      ids.push(next++);
    }
    meshIds.set(m.id, ids);
  });
  return meshIds;
}

export async function createViewer(opts: ViewerOptions): Promise<Viewer> {
  const { overlay, engineUrl = 'engine/toybox.js', assetsUrl = 'assets' } = opts;
  await loadScript(engineUrl);
  const M = await ToyboxModule({ locateFile: (f: string) => engineUrl.replace(/[^/]*$/, '') + f });
  const w = opts.width || 1280, h = opts.height || 720;
  M._scene_init(w, h);
  await loadPeople(M, assetsUrl);
  const catalogueData: unknown = await (await fetch(`${assetsUrl}/catalogue.json`)).json();
  if (!isCatalogue(catalogueData)) throw new Error('The catalogue file has no models.');
  const catalogue: Catalogue = catalogueData;
  const models = new Map(catalogue.models.map((m): [string, Model] => [m.id, m]));
  const outfits = new Map((catalogue.outfits ?? []).map((f): [string, Outfit] => [f.id, f]));
  const meshIds = await loadMeshes(M, assetsUrl, catalogue);
  const v = makeViewer(() => c, M, catalogue, models);
  const c: Ctx = { M, v, w, h, overlay, octx: overlay ? context2d(overlay) : null, models, outfits, meshIds, audios: new Map(), mapGeneration: 0, dragFrame: 0, last: 0 };
  return v;
}

// The public object. Its methods run on the shared state, which exists once createViewer is done.
function makeViewer(ctx: () => Ctx, M: Engine, catalogue: Catalogue, models: Map<string, Model>): Viewer {
  assert(typeof ctx === 'function');
  assert(typeof M === 'object');
  assert(typeof catalogue === 'object');
  assert(typeof models === 'object');
  const bind = <A extends unknown[], R>(f: (c: Ctx, ...a: A) => R) => (...a: A): R => f(ctx(), ...a);
  return {
    M, catalogue, models, scene: null, t: 0, playing: false, selected: null,
    userCam: false, orbit: { yaw: 0, pitch: 0.4, dist: 12, tx: 0, ty: 1, tz: 0 },
    showOverlay: true, undo: [], onchange: null, onframe: null, onedit: null, exporting: false,
    rootIds: new Map(),   // object id -> engine id
    mapImage: null, logo: null,
    posed: [],            // the objects with motions or a life of their own: { id (engine id), motions, seed, unit, pivot }
    voiceUrl: null,       // file -> URL of a voice file of the narration, or null for no sound
    clips: [],            // the voice of each sentence: { start, end, audio, on }
    tilesReady: Promise.resolve(),
    size: () => [ctx().w, ctx().h], resize: bind(resize), sizeOf: bind(sizeOf),
    load: (s, keep = true) => { loadScene(ctx(), s, keep); }, oneMap, loadLogo: bind(loadLogo),
    project: bind(project), draw: bind(draw), drawOverlay: bind(drawOverlay), camState: () => ({ eye: [M._cam_x(), M._cam_y(), M._cam_z()] }),
    orbitBy: bind(orbitBy), zoomBy: bind(zoomBy), panBy: bind(panBy), storyCamera: bind(storyCamera), pick: bind(pick), select: bind(select),
    groundPoint: bind(groundPoint), undoEdit: bind(undoEdit), edit: bind(edit), beginDrag: bind(beginDrag), moveSelectedTo: bind(moveSelectedTo),
    endDrag: bind(endDrag), play: bind(play), pause: bind(pause), seek: bind(seek), download: bind(download), readPixels: bind(readPixels),
  };
}
const cur = (c: Ctx): Scene => { if (!c.v.scene) throw new Error('viewer: no scene is loaded'); return c.v.scene; };

function resize(c: Ctx, w: number, h: number): void {
  assert(typeof c === 'object');
  assert(typeof w === 'number');
  assert(typeof h === 'number');
  assert(!Number.isNaN(w));
  assert(!Number.isNaN(h));
  c.w = w; c.h = h; c.M._scene_resize(w, h);
  if (c.overlay) { c.overlay.width = w; c.overlay.height = h; }
}

// ---- build the engine scene from the scene file
const flagsOf = (o: SceneObject): number => (o.hidden ? FLAG.hidden : 0) | ((o.tags ?? []).includes('ceiling') ? FLAG.ceiling : 0) | ((o.tags ?? []).includes('wall') ? FLAG.wall : 0);
function add(c: Ctx, prim: number, mesh: number, parent: number, flags: number, variant: number, pose: number, flip: boolean | undefined,
  at: Vec3, yaw: number, rot: Vec3, sc: Vec3, c1: Vec3, c2: Vec3, shadow: number): number {
  assert(typeof c === 'object');
  assert(typeof prim === 'number');
  assert(typeof mesh === 'number');
  assert(typeof parent === 'number');
  assert(typeof flags === 'number');
  assert(typeof variant === 'number');
  assert(typeof pose === 'number');
  assert(typeof at === 'object');
  assert(typeof yaw === 'number');
  assert(typeof rot === 'object');
  assert(typeof sc === 'object');
  assert(typeof c1 === 'object');
  assert(typeof c2 === 'object');
  assert(typeof shadow === 'number');
  assert(!Number.isNaN(prim));
  assert(!Number.isNaN(mesh));
  assert(!Number.isNaN(parent));
  assert(!Number.isNaN(flags));
  assert(!Number.isNaN(variant));
  assert(!Number.isNaN(pose));
  assert(!Number.isNaN(at[0]));
  assert(!Number.isNaN(yaw));
  assert(!Number.isNaN(rot[0]));
  assert(!Number.isNaN(sc[0]));
  assert(!Number.isNaN(c1[0]));
  assert(!Number.isNaN(c2[0]));
  assert(!Number.isNaN(shadow));
  const returned = c.M._obj_add(prim, mesh, parent, flags, variant, pose, flip ? 1 : 0, at[0], at[1], at[2], yaw, rot[0], rot[1], rot[2],
    sc[0], sc[1], sc[2], c1[0], c1[1], c1[2], c2[0], c2[1], c2[2], shadow);
  assert(typeof returned === 'number');
  return returned;
}
function sizeOf(c: Ctx, o: { model: string }): Vec3 { 
  assert(typeof c === 'object');
  assert(typeof o === 'object');
  return o.model === 'person' ? PERSON_SIZE : c.models.get(o.model)?.size ?? [1, 1, 1]; }

function loadScene(c: Ctx, scene: Scene, keepTime: boolean): void {
  assert(typeof c === 'object');
  assert(typeof scene === 'object');
  assert(typeof keepTime === 'boolean');
  const { M, v } = c;
  v.scene = scene;
  if (!keepTime) v.t = 0;
  M._scene_reset();
  v.rootIds.clear();
  const bd: Partial<Scene['backdrop']> = isRecord(scene.backdrop) ? scene.backdrop : {};
  const bc = hexRGB(bd.color || '#9fb88c');
  M._set_backdrop(GROUND[bd.ground || 'grass'] ?? 0, (bd.size ?? [80, 80])[0], (bd.size ?? [80, 80])[1], bc[0], bc[1], bc[2]);
  M._set_cutaway(scene.cutaway?.ceilings ? 1 : 0, scene.cutaway?.nearWalls ? 1 : 0);
  addObjects(c, scene);
  buildPosed(c, scene);
  hush(c);
  buildClips(c, scene);
  loadTracks(c, scene);
  for (const k of orEmpty(scene.camera)) M._cam_add(k.t, k.eye[0], k.eye[1], k.eye[2], k.target[0], k.target[1], k.target[2], k.fov || 50, EASE[k.ease ?? ''] ?? 1);
  const looks = scene.lighting?.length ? scene.lighting : [{ t: 0, look: bd.ground === 'floor' ? 'indoor' : 'day' }];
  for (const l of looks) M._light_add(l.t, LOOKS[l.look] ?? 0);
  void buildMap(c, scene);
  v.draw(v.t);
  if (v.onchange) v.onchange('load');
}

function addObjects(c: Ctx, scene: Scene): void {
  assert(typeof c === 'object');
  assert(typeof scene === 'object');
  const done = new Set();
  for (const first of scene.objects) {
    const chain: SceneObject[] = [];
    for (let o: SceneObject | undefined = first; o && !done.has(o.id); o = o.parent ? scene.objects.find(x => x.id === o.parent) : undefined) {
      done.add(o.id);
      chain.push(o);
    }
    for (const o of chain.reverse()) addOne(c, scene, o); // parents first
  }
}
function addOne(c: Ctx, scene: Scene, o: SceneObject): void {
  assert(typeof c === 'object');
  assert(typeof scene === 'object');
  assert(typeof o === 'object');
  const po = o.parent ? scene.objects.find(x => x.id === o.parent) : undefined;
  const parent = po ? c.v.rootIds.get(po.id) ?? -1 : -1;
  if (o.model === 'person') { addPerson(c, o, parent); return; }
  const m = c.models.get(o.model);
  if (!m) return;
  const at = atOf(o), sc = scaleOf(o), flags = flagsOf(o);
  const structural = (o.tags ?? []).some(t => t === 'wall' || t === 'floor' || t === 'ceiling');
  const shadow = structural || ['road', 'building'].includes(m.kind || '') ? 0 : 0.45 * Math.max(m.size[0], m.size[2]);
  const root = add(c, 6, 0, parent, flags, 0, 0, o.flip, at, o.yaw || 0, [0, 0, 0], sc, [0, 0, 0], [0, 0, 0], shadow);
  c.v.rootIds.set(o.id, root);
  if (meshOf(m)) (c.meshIds.get(m.id) ?? []).forEach((id, k) => {
    assert(typeof id === 'number');
    assert(typeof k === 'number');
    assert(!Number.isNaN(id));
    assert(!Number.isNaN(k));
    const gr = nth(groupsOf(m), k);
    add(c, 5, id, root, flags, 0, 0, false, [0, 0, 0], 0, [0, 0, 0], [1, 1, 1], hexRGB((o.colors && gr.slot && o.colors[gr.slot]) || gr.color), [0, 0, 0], 0);
  });
  else for (const p of m.parts) {
    const col = hexRGB((o.colors && p.slot && o.colors[p.slot]) || p.color);
    const prim = PRIMS[p.prim] ?? 0;
    add(c, prim, 0, root, flags | (p.eye ? FLAG.eye : 0), 0, 0, false, p.pos, 0, p.rot ?? [0, 0, 0], p.size, col, [0, 0, 0], 0);
  }
}
function addPerson(c: Ctx, o: SceneObject, parent: number): void {
  assert(typeof c === 'object');
  assert(typeof o === 'object');
  assert(typeof parent === 'number');
  assert(!Number.isNaN(parent));
  const flags = flagsOf(o), n = o.variant || 0;
  const fit = o.outfit ? c.outfits.get(o.outfit) : undefined;
  const col = { ...(fit?.colors), ...o.colors };
  const id = add(c, 4, 0, parent, flags, n, POSES[o.pose || 'stand'] ?? 0, o.flip, atOf(o), o.yaw || 0, [0, 0, 0], scaleOf(o),
    hexRGB(col.shirt || SHIRTS[n % SHIRTS.length]), hexRGB(col.pants || PANTS[n % PANTS.length]), 0.32);
  c.v.rootIds.set(o.id, id);
  for (const p of fit ? fit.parts : []) {
    const prim = PRIMS[p.prim] ?? 0;
    c.M._obj_bone(add(c, prim, 0, id, flags, 0, 0, false, p.pos, 0, p.rot ?? [0, 0, 0], p.size, hexRGB(p.color), [0, 0, 0], 0), BONES.get(p.bone || '') ?? -1);
  }
}
function buildPosed(c: Ctx, scene: Scene): void {
  assert(typeof c === 'object');
  assert(typeof scene === 'object');
  c.v.posed = [];
  for (const o of scene.objects) {
    const motions = (scene.motions ?? []).filter(m => m.object === o.id), id = c.v.rootIds.get(o.id);
    const character = (c.models.get(o.model)?.tags ?? []).includes('character');
    if (id === undefined || (!motions.length && !character)) continue;
    const size = sizeOf(c, o), sy = o.scale ? (Array.isArray(o.scale) ? o.scale[1] : o.scale) : 1;
    c.v.posed.push({ id, motions, seed: character ? seedOf(o.id) : null, unit: size[1] * sy / 2, pivot: size[1] / 2 });
  }
}
function buildClips(c: Ctx, scene: Scene): void {
  assert(typeof c === 'object');
  assert(typeof scene === 'object');
  const voiceUrl = c.v.voiceUrl;
  c.v.clips = [];
  if (voiceUrl) for (const n of scene.narration ?? []) {
    if (!n.voice || n.start === undefined || n.end === undefined) continue;
    const url = voiceUrl(n.voice);
    let audio = c.audios.get(url);
    if (!audio) { audio = Object.assign(new Audio(url), { preload: 'auto' }); c.audios.set(url, audio); }
    c.v.clips.push({ start: n.start, end: n.end, audio, on: false });
  }
}
function loadTracks(c: Ctx, scene: Scene): void {
  assert(typeof c === 'object');
  const M = c.M;
  for (const tr of orEmpty(scene.tracks)) {
    const id = c.v.rootIds.get(tr.object);
    if (id === undefined || !tr.keys.length) continue;
    const ch = CHANNELS[tr.channel];
    if (ch === undefined) continue;
    M._trk_begin(id, ch);
    const ease = (e: string | undefined): number => EASE[e ?? ''] ?? 0;
    for (const k of tr.keys) {
      if (tr.channel === 'at') { const [a, b, d] = vec3Of(k.v) ?? [0, 0, 0]; M._key_add(k.t, a, b, d, ease(k.ease)); }
      else if (tr.channel === 'yaw') M._key_add(k.t, numberOf(k.v), 0, 0, ease(k.ease));
      else if (tr.channel === 'scale') { const [a, b, d] = vec3Of(k.v) ?? [numberOf(k.v), numberOf(k.v), numberOf(k.v)]; M._key_add(k.t, a, b, d, ease(k.ease)); }
      else M._key_add(k.t, typeof k.v === 'string' ? POSES[k.v] ?? 0 : 0, 0, 0, 2);
    }
  }
}

function hush(c: Ctx): void { for (const k of c.v.clips) if (k.on) { k.audio.pause(); k.on = false; } }

// ---- map: OSM footprints extruded, OneMap tiles live
function polyArea(poly: Vec2[]): number {
  let area = 0;
  for (let i = 0; i < poly.length; i++) { const [x1, z1] = nth(poly, i), [x2, z2] = nth(poly, (i + 1) % poly.length); area += x1 * z2 - x2 * z1; }
  return area;
}
function ear(poly: Vec2[]): Vec3[] {  // simple ear clipping, poly = [[x,z],...], returns triangles of indices
  const n = poly.length, idx = [...Array(n).keys()], tris: Vec3[] = [];
  if (polyArea(poly) < 0) idx.reverse();
  const cross = (a: number, b: number, c: number): number => {
    assert(typeof a === 'number');
    assert(typeof b === 'number');
    assert(typeof c === 'number');
    assert(!Number.isNaN(a));
    assert(!Number.isNaN(b));
    assert(!Number.isNaN(c));
    const pa = nth(poly, a), pb = nth(poly, b), pc = nth(poly, c);
    const returned = (pb[0] - pa[0]) * (pc[1] - pa[1]) - (pb[1] - pa[1]) * (pc[0] - pa[0]);
    assert(typeof returned === 'number');
    return returned;
  };
  const inside = (p: number, a: number, b: number, c: number): boolean => cross(a, b, p) >= 0 && cross(b, c, p) >= 0 && cross(c, a, p) >= 0;
  let guard = 0;
  while (idx.length > 3 && guard++ < 5000) {
    let cut = false;
    for (let i = 0; i < idx.length; i++) {
      const a = nth(idx, (i + idx.length - 1) % idx.length), b = nth(idx, i), c = nth(idx, (i + 1) % idx.length);
      if (cross(a, b, c) <= 0) continue;
      if (idx.some(p => p !== a && p !== b && p !== c && inside(p, a, b, c))) continue;
      tris.push([a, b, c]); idx.splice(i, 1); cut = true; break;
    }
    if (!cut) break;
  }
  if (idx.length === 3) tris.push([nth(idx, 0), nth(idx, 1), nth(idx, 2)]);
  return tris;
}
function extrude(b: OsmBuilding, out: number[]): void {
  assert(typeof b === 'object');
  assert(typeof out === 'object');
  assert(out.length < 1e7);
  const p = b.poly.slice();
  if (p.length > 1) { const first = nth(p, 0), end = nth(p, p.length - 1); if (first[0] === end[0] && first[1] === end[1]) p.pop(); }
  if (p.length < 3) return;
  const h = b.height || 9;
  const q = polyArea(p) < 0 ? p.slice().reverse() : p;     // counter-clockwise seen from +y with z south
  for (let i = 0; i < q.length; i++) {
    const [x1, z1] = nth(q, i), [x2, z2] = nth(q, (i + 1) % q.length);
    const dx = x2 - x1, dz = z2 - z1, l = Math.hypot(dx, dz) || 1, nx = dz / l, nz = -dx / l;
    const v4: Vec3[] = [[x1, 0, z1], [x2, 0, z2], [x2, h, z2], [x1, h, z1]];
    for (const k of [0, 2, 1, 0, 3, 2]) out.push(...nth(v4, k), nx, 0, nz);
  }
  for (const [a, c, d] of ear(q)) for (const k of [a, d, c]) out.push(nth(q, k)[0], h, nth(q, k)[1], 0, 1, 0);
}
function buildMap(c: Ctx, scene: Scene): Promise<void> {
  const { M, v } = c;
  const generation = ++c.mapGeneration;
  const map = scene.map;
  M._ground_map(0, 0, 0, 0, 0);
  v.mapImage = false;
  v.tilesReady = Promise.resolve();
  if (!map) return v.tilesReady;
  if (map.osm?.buildings.length) uploadBuildings(c, map.osm.buildings);
  // The tiles load from the network. The promise lets the export wait for the map before the
  // first frame. The authoring page does not wait: the map appears when it arrives.
  if (map.origin && v.oneMap(scene)) v.tilesReady = loadTiles(c, map, map.origin, generation).catch(() => { /* a failed tile load leaves the map out */ });
  return v.tilesReady;
}
function uploadBuildings(c: Ctx, buildings: OsmBuilding[]): void {
  assert(typeof c === 'object');
  assert(typeof buildings === 'object');
  assert(buildings.length < 1e7);
  const palette: Vec3[] = [[0.86, 0.80, 0.70], [0.78, 0.80, 0.82], [0.84, 0.68, 0.58]];
  const groups: number[][] = [[], [], []];
  buildings.forEach((b, i) => { extrude(b, nth(groups, i % 3)); });
  groups.forEach((g, gi) => {
    assert(typeof g === 'object');
    assert(typeof gi === 'number');
    assert(g.length < 1e7);
    assert(!Number.isNaN(gi));
    if (!g.length || g.length * 4 > c.M._toybox_up_size()) return;
    c.M.HEAPF32.set(new Float32Array(g), up(c) >> 2);
    const mesh = 8 + gi;
    c.M._toybox_mesh_upload(mesh, g.length);
    const id = add(c, 5, mesh, -1, 0, 0, 0, false, [0, 0, 0], 0, [0, 0, 0], [1, 1, 1], nth(palette, gi), [0, 0, 0], 0);
    c.v.rootIds.set(`__osm${gi}`, id);
  });
}
function oneMap(scene: Scene): boolean { return !!(scene.map?.origin && scene.backdrop.ground === 'map'); }
const mercator = (lat: number, lon: number, z: number): Vec2 => {
  assert(typeof lat === 'number');
  assert(typeof lon === 'number');
  assert(typeof z === 'number');
  assert(!Number.isNaN(lat));
  assert(!Number.isNaN(lon));
  assert(!Number.isNaN(z));
  const n = 2 ** z, x = (lon + 180) / 360 * n, s = Math.sin(lat * Math.PI / 180);
  return [x, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n];
};
// Draws the 3 by 3 tiles around (cx, cy) on g. Resolves true when at least one tile loaded.
async function fetchTiles(g: CanvasRenderingContext2D, style: string, z: number, cx: number, cy: number, R: number): Promise<boolean> {
  assert(typeof g === 'object');
  assert(typeof style === 'string');
  assert(typeof z === 'number');
  assert(typeof cx === 'number');
  assert(typeof cy === 'number');
  assert(typeof R === 'number');
  assert(style.length < 1e7);
  assert(!Number.isNaN(z));
  assert(!Number.isNaN(cx));
  assert(!Number.isNaN(cy));
  assert(!Number.isNaN(R));
  let any = false;
  await Promise.all([...Array(2 * R + 1).keys()].flatMap(i => [...Array(2 * R + 1).keys()].map(j => new Promise<void>(done => {
    assert(typeof done === 'function');
    assert(typeof g === 'object');
    assert(typeof i === 'number');
    const im = new Image(); im.crossOrigin = 'anonymous';
    im.onload = () => { g.drawImage(im, i * 256, j * 256); any = true; done(); };
    im.onerror = () => { done(); };
    im.src = `https://www.onemap.gov.sg/maps/tiles/${style}/${z}/${cx - R + i}/${cy - R + j}.png`;
  }))));
  return any;
}
async function loadTiles(c: Ctx, map: SceneMap, o: { lat: number; lon: number }, generation: number): Promise<void> {
  assert(typeof c === 'object');
  assert(typeof map === 'object');
  assert(typeof o === 'object');
  assert(typeof generation === 'number');
  assert(!Number.isNaN(generation));
  const om = map.onemap ?? {}, z = om.zoom || 18, style = om.style || 'Default';
  const [fx, fy] = mercator(o.lat, o.lon, z), cx = Math.floor(fx), cy = Math.floor(fy), R = 1;
  const mPerTile = 156543.03392 * Math.cos(o.lat * Math.PI / 180) / 2 ** z * 256;
  const cv = document.createElement('canvas'); cv.width = cv.height = 256 * (2 * R + 1);
  const g = context2d(cv);
  const any = await fetchTiles(g, style, z, cx, cy, R);
  if (!any || generation !== c.mapGeneration) return;
  let d: ImageData;
  try {
    d = g.getImageData(0, 0, cv.width, cv.height);
  } catch { return; }   // a tainted canvas: the tiles stay off
  if (generation !== c.mapGeneration) return;
  c.M.HEAPU8.set(d.data, up(c));
  c.M._toybox_ground_upload(cv.width, cv.height);
  // metres from the origin: x east, z south
  const x0 = ((cx - R) - fx) * mPerTile, x1 = ((cx + R + 1) - fx) * mPerTile;
  const z0 = ((cy - R) - fy) * mPerTile, z1 = ((cy + R + 1) - fy) * mPerTile;
  c.M._ground_map(1, x0, z0, x1, z1);
  c.v.mapImage = true;
  if (c.v.scene) c.v.draw(c.v.t);   // the tiles arrive after the first frame
}
function loadLogo(c: Ctx): Promise<void> {
  return new Promise(done => {
    const im = new Image(); im.crossOrigin = 'anonymous';
    im.onload = () => { c.v.logo = im; done(); }; im.onerror = () => { done(); }; im.src = ONEMAP_LOGO;
  });
}

// ---- drawing
function project(c: Ctx, x: number, y: number, z: number): Vec2 | null { 
  assert(typeof c === 'object');
  assert(typeof x === 'number');
  assert(typeof y === 'number');
  assert(typeof z === 'number');
  assert(!Number.isNaN(x));
  assert(!Number.isNaN(y));
  assert(!Number.isNaN(z));
  return c.M._project(x, y, z) ? [c.M._proj_x(), c.M._proj_y()] : null; }
function draw(c: Ctx, t: number): void {
  assert(typeof c === 'object');
  assert(typeof t === 'number');
  assert(!Number.isNaN(t));
  const { M, v } = c;
  v.t = t;
  if (v.userCam) { const o = v.orbit; M._cam_user(1, o.yaw, o.pitch, o.dist, o.tx, o.ty, o.tz); } else M._cam_user(0, 0, 0, 0, 0, 0, 0);
  for (const q of v.posed) {   // the eyes turn at most about 50 degrees to a side and up
    const { dx = 0, z = 0, up: pup = 0, tilt = 0, s = 0, sx = 0, sz = 0, ex = 0, ez = 0, spin = 0, eye = 0 } = poseAt(q.motions, t, q.seed);
    const lim = (x: number, m: number): number => Math.max(-m, Math.min(m, x));
    M._obj_pose(q.id, dx * q.unit, (z + pup) * q.unit, tilt, s * sx, s * sz, lim(1.9 * ex, 0.85) + spin, lim(2.5 * ez, 0.9), eye, q.pivot);
  }
  M._render_frame(t);
  if (c.octx) { c.octx.clearRect(0, 0, c.w, c.h); if (v.showOverlay) drawOverlay(c, c.octx, c.w, c.h, t); }
  if (v.onframe) v.onframe(t);
}

// Text with small raised and lowered parts (engine/vid.goose). s is the font size, weight the font weight.
function textW(ctx: CanvasRenderingContext2D, text: string, s: number, weight: number): number {
  assert(typeof ctx === 'object');
  assert(typeof text === 'string');
  assert(typeof s === 'number');
  assert(typeof weight === 'number');
  assert(text.length < 1e7);
  assert(!Number.isNaN(s));
  assert(!Number.isNaN(weight));
  let w = 0;
  for (const p of marks(text)) { ctx.font = `${weight} ${p.shift ? s * 0.7 : s}px ${FONT}`; w += ctx.measureText(p.text).width; }
  ctx.font = `${weight} ${s}px ${FONT}`;
  return w;
}
function fillText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, s: number, weight: number): void {
  assert(typeof ctx === 'object');
  assert(typeof text === 'string');
  assert(typeof x === 'number');
  assert(typeof y === 'number');
  assert(typeof s === 'number');
  assert(typeof weight === 'number');
  assert(text.length < 1e7);
  assert(!Number.isNaN(x));
  assert(!Number.isNaN(y));
  assert(!Number.isNaN(s));
  assert(!Number.isNaN(weight));
  const align = ctx.textAlign, w = textW(ctx, text, s, weight);
  let px = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  ctx.textAlign = 'left';
  for (const p of marks(text)) {
    ctx.font = `${weight} ${p.shift ? s * 0.7 : s}px ${FONT}`;
    ctx.fillText(p.text, px, y + (p.shift > 0 ? -0.4 * s : p.shift < 0 ? 0.2 * s : 0));
    px += ctx.measureText(p.text).width;
  }
  ctx.font = `${weight} ${s}px ${FONT}`; ctx.textAlign = align;
}
function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number, s: number, weight: number): string[] {
  assert(typeof ctx === 'object');
  assert(typeof text === 'string');
  assert(typeof maxW === 'number');
  assert(typeof s === 'number');
  assert(typeof weight === 'number');
  assert(text.length < 1e7);
  assert(!Number.isNaN(maxW));
  assert(!Number.isNaN(s));
  assert(!Number.isNaN(weight));
  const words = text.split(/\s+(?![^{]*\})/), lines: string[] = []; let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (textW(ctx, test, s, weight) > maxW && line) { lines.push(line); line = w; } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}
function pill(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string): void {
  assert(typeof ctx === 'object');
  assert(typeof x === 'number');
  assert(typeof y === 'number');
  assert(typeof w === 'number');
  assert(typeof h === 'number');
  assert(typeof r === 'number');
  assert(typeof fill === 'string');
  assert(!Number.isNaN(x));
  assert(!Number.isNaN(y));
  assert(!Number.isNaN(w));
  assert(!Number.isNaN(h));
  assert(!Number.isNaN(r));
  assert(fill.length < 1e7);
  ctx.fillStyle = fill; ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill();
}
// The "approximate" tag on an estimated chapter, callout or sign. x, y is its top left corner.
function approx(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): number {
  assert(typeof ctx === 'object');
  assert(typeof x === 'number');
  assert(typeof y === 'number');
  assert(typeof s === 'number');
  assert(!Number.isNaN(x));
  assert(!Number.isNaN(y));
  assert(!Number.isNaN(s));
  ctx.font = `600 ${s}px ${FONT}`;
  const tw = ctx.measureText('approximate').width;
  pill(ctx, x, y, tw + s, s * 1.5, s * 0.3, '#f2c14e');
  ctx.fillStyle = '#1c1b18'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText('approximate', x + s * 0.5, y + s * 0.75);
  const returned = tw + s;
  assert(typeof returned === 'number');
  return returned;
}
// The text at least 4 percent of the frame height; white on a dark box (contrast above 4.5 to 1).
function drawOverlay(c: Ctx, ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void {
  assert(typeof c === 'object');
  assert(typeof ctx === 'object');
  assert(typeof w === 'number');
  assert(typeof h === 'number');
  assert(typeof t === 'number');
  assert(!Number.isNaN(w));
  assert(!Number.isNaN(h));
  assert(!Number.isNaN(t));
  const sc = c.v.scene; if (!sc) return;
  drawSigns(c, ctx, sc, h, t);
  drawCallouts(c, ctx, sc, w, h, t);
  drawChapter(ctx, sc, h, t);
  drawCaptions(c, ctx, sc, w, h, t);
  drawCredits(c, ctx, sc, w, h);
  // selection box
  if (c.v.selected && !c.v.exporting) {
    const b = screenBox(c, c.v.selected);
    if (b) { ctx.strokeStyle = '#e0805c'; ctx.lineWidth = Math.max(2, h / 360); ctx.setLineDash([8, 6]); ctx.strokeRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0); ctx.setLineDash([]); }
  }
}
function drawSigns(c: Ctx, ctx: CanvasRenderingContext2D, sc: Scene, h: number, t: number): void {
  assert(typeof c === 'object');
  assert(typeof ctx === 'object');
  assert(typeof sc === 'object');
  assert(typeof h === 'number');
  assert(typeof t === 'number');
  assert(!Number.isNaN(h));
  assert(!Number.isNaN(t));
  const { M, v } = c;
  for (const o of sc.objects) {
    const m = c.models.get(o.model);
    if (m?.kind !== 'sign' || !o.label || !signLabelShown(sc, o.id, t)) continue;
    const id = v.rootIds.get(o.id); if (id === undefined) continue;
    const p = v.project(M._obj_wx(id), M._obj_wy(id) + m.size[1] * 0.6, M._obj_wz(id));
    if (!p) continue;
    const dist = Math.hypot(M._obj_wx(id) - M._cam_x(), M._obj_wy(id) - M._cam_y(), M._obj_wz(id) - M._cam_z());
    const s = Math.max(h * 0.02, Math.min(h * 0.032, h * 1.4 / dist));
    const tw = textW(ctx, o.label, s, 600);
    pill(ctx, p[0] - tw / 2 - s * 0.4, p[1] - s * 0.8, tw + s * 0.8, s * 1.4, s * 0.3, 'rgba(255,255,255,0.92)');
    ctx.fillStyle = '#1c1b18'; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    fillText(ctx, o.label, p[0], p[1] - s * 0.1, s, 600);
    if (o.estimated) { ctx.font = `600 ${s * 0.75}px ${FONT}`; approx(ctx, p[0] - (ctx.measureText('approximate').width + s * 0.75) / 2, p[1] + s * 0.7, s * 0.75); }
  }
}
function drawCallouts(c: Ctx, ctx: CanvasRenderingContext2D, sc: Scene, w: number, h: number, t: number): void {
  assert(typeof c === 'object');
  assert(typeof ctx === 'object');
  assert(typeof sc === 'object');
  assert(typeof w === 'number');
  assert(typeof h === 'number');
  assert(typeof t === 'number');
  assert(!Number.isNaN(w));
  assert(!Number.isNaN(h));
  assert(!Number.isNaN(t));
  const { M, v } = c;
  for (const k of orEmpty(sc.callouts)) {
    if (t < k.start || t >= k.end) continue;
    let pos = vec3Of(isRecord(k) ? k.at : undefined);
    if (k.object) { const id = v.rootIds.get(k.object); if (id === undefined) continue; const co = sc.objects.find(o => o.id === k.object); pos = [M._obj_wx(id), M._obj_wy(id) + ((co ? sizeOf(c, co)[1] : 1) || 1.7), M._obj_wz(id)]; }
    if (!pos) continue;
    const p = v.project(pos[0], pos[1], pos[2]); if (!p) continue;
    const s = Math.round(h * 0.04);
    const lines = wrap(ctx, k.text, w * 0.28, s, 500), lh = s * 1.25;
    const bw = Math.max(...lines.map(l => textW(ctx, l, s, 500))) + s, bh = lines.length * lh + s * 0.6;
    const x = Math.min(w - bw - 8, Math.max(8, p[0] - bw / 2)), y = Math.max(8, p[1] - bh - s * 1.2);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = Math.max(2, h / 540);
    ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(p[0], y + bh); ctx.stroke();
    pill(ctx, x, y, bw, bh, s * 0.35, 'rgba(20,20,20,0.82)');
    ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    lines.forEach((l, i) => { fillText(ctx, l, x + s * 0.5, y + s * 0.3 + i * lh, s, 500); });
    if (flag(k, 'estimated') || sc.objects.find(o => o.id === k.object)?.estimated) approx(ctx, x, Math.max(2, y - s * 0.8), s * 0.55);
  }
}
// The chapter title and clock.
function drawChapter(ctx: CanvasRenderingContext2D, sc: Scene, h: number, t: number): void {
  assert(typeof ctx === 'object');
  assert(typeof sc === 'object');
  assert(typeof h === 'number');
  assert(typeof t === 'number');
  assert(!Number.isNaN(h));
  assert(!Number.isNaN(t));
  const ch = (orEmpty(sc.chapters)).find(c => t >= c.start && t < c.end);
  if (!ch || !(ch.clock || ch.title)) return;
  const s = Math.round(h * 0.042);
  const txt = [ch.clock, ch.title].filter(Boolean).join('  ·  ');
  const tw = textW(ctx, txt, s, 600);
  pill(ctx, h * 0.02, h * 0.02, tw + s, s * 1.6, s * 0.4, 'rgba(20,20,20,0.82)');
  ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  fillText(ctx, txt, h * 0.02 + s * 0.5, h * 0.02 + s * 0.8, s, 600);
  if (flag(ch, 'estimated')) approx(ctx, h * 0.02 + tw + s * 1.3, h * 0.02 + s * 0.2, s * 0.8);
}
const hasOsm = (sc: Scene): boolean => !!(sc.map?.osm?.buildings.length);
function drawCaptions(c: Ctx, ctx: CanvasRenderingContext2D, sc: Scene, w: number, h: number, t: number): void {
  assert(typeof c === 'object');
  assert(typeof ctx === 'object');
  assert(typeof sc === 'object');
  assert(typeof w === 'number');
  assert(typeof h === 'number');
  assert(typeof t === 'number');
  assert(!Number.isNaN(w));
  assert(!Number.isNaN(h));
  assert(!Number.isNaN(t));
  const caps = (orEmpty(sc.captions)).filter(k => t >= k.start && t < k.end);
  if (!caps.length) return;
  const fs = Math.round(h * 0.045);
  const lines = wrap(ctx, caps.map(k => k.text).join(' '), w * 0.82, fs, 500), lh = fs * 1.25;
  const bw = Math.max(...lines.map(l => textW(ctx, l, fs, 500))) + fs, bh = lines.length * lh + fs * 0.5;
  const nCred = (orEmpty(sc.credits)).length + (hasOsm(sc) ? 1 : 0) + (c.v.mapImage ? 1 : 0);
  const x = (w - bw) / 2, y = h - bh - h * 0.02 - nCred * h * 0.031 - h * 0.012;
  pill(ctx, x, y, bw, bh, fs * 0.35, 'rgba(20,20,20,0.82)');
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  lines.forEach((l, i) => { fillText(ctx, l, w / 2, y + fs * 0.25 + i * lh, fs, 500); });
}
function drawCredits(c: Ctx, ctx: CanvasRenderingContext2D, sc: Scene, w: number, h: number): void {
  assert(typeof c === 'object');
  assert(typeof ctx === 'object');
  assert(typeof sc === 'object');
  assert(typeof w === 'number');
  assert(typeof h === 'number');
  assert(!Number.isNaN(w));
  assert(!Number.isNaN(h));
  const credits = [...(orEmpty(sc.credits))];
  if (hasOsm(sc)) credits.push(OSM_CREDIT);
  if (c.v.mapImage) credits.push(ONEMAP_CREDIT);
  if (!credits.length) return;
  const s = Math.round(h * 0.022);
  ctx.font = `400 ${s}px ${FONT}`; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
  let y = h - h * 0.01;
  for (const k of credits.reverse()) {
    const tw = ctx.measureText(k).width;
    pill(ctx, w - tw - s * 1.2, y - s * 1.3, tw + s, s * 1.25, s * 0.25, 'rgba(20,20,20,0.6)');
    ctx.fillStyle = '#fff'; ctx.fillText(k, w - s * 0.7, y - s * 0.15); y -= s * 1.4;
  }
  if (c.v.logo && c.v.mapImage) ctx.drawImage(c.v.logo, w - s * 5.5, y - s * 1.8, s * 5, s * 1.8);
}

// ---- camera control
function storyCam(c: Ctx, t: number): { target: Vec3; fov: number } {   // the story camera target and fov at time t, as the engine samples them
  assert(typeof c === 'object');
  assert(typeof t === 'number');
  assert(!Number.isNaN(t));
  const ks = orEmpty(cur(c).camera);
  if (!ks.length) return { target: [0, 1, 0], fov: 50 };
  let a = 0;
  ks.forEach((k, i) => { 
    assert(typeof k === 'object');
    assert(typeof i === 'number');
    assert(!Number.isNaN(i));
    if (k.t <= t) a = i; });
  const b = Math.min(a + 1, ks.length - 1), A = nth(ks, a), B = nth(ks, b);
  let u = b === a ? 0 : Math.max(0, Math.min(1, (t - A.t) / (B.t - A.t)));
  u = A.ease === 'step' ? 0 : A.ease === 'linear' ? u : u * u * (3 - 2 * u);
  const lerp = (i: 0 | 1 | 2): number => A.target[i] + (B.target[i] - A.target[i]) * u;
  return { target: [lerp(0), lerp(1), lerp(2)], fov: (A.fov || 50) + ((B.fov || 50) - (A.fov || 50)) * u };
}
function ensureUserCam(c: Ctx): void {
  const { M, v } = c;
  if (v.userCam) return;
  // start from the story camera: look from the current eye at its target
  const e: Vec3 = [M._cam_x(), M._cam_y(), M._cam_z()];
  const tg = storyCam(c, v.t).target;
  const dx = e[0] - tg[0], dy = e[1] - tg[1], dz = e[2] - tg[2];
  const d = Math.hypot(dx, dy, dz) || 10;
  v.orbit = { yaw: Math.atan2(dx, dz), pitch: Math.asin(Math.max(-1, Math.min(1, dy / d))), dist: d, tx: tg[0], ty: tg[1], tz: tg[2] };
  v.userCam = true;
}
function orbitBy(c: Ctx, dyaw: number, dpitch: number): void { 
  assert(typeof c === 'object');
  assert(typeof dyaw === 'number');
  assert(typeof dpitch === 'number');
  assert(!Number.isNaN(dyaw));
  assert(!Number.isNaN(dpitch));
  ensureUserCam(c); const o = c.v.orbit; o.yaw -= dyaw; o.pitch = Math.max(-0.2, Math.min(1.5, o.pitch + dpitch)); c.v.draw(c.v.t); }
function zoomBy(c: Ctx, f: number): void { 
  assert(typeof c === 'object');
  assert(typeof f === 'number');
  assert(!Number.isNaN(f));
  ensureUserCam(c); const o = c.v.orbit; o.dist = Math.max(1.5, Math.min(300, o.dist * f)); c.v.draw(c.v.t); }
function panBy(c: Ctx, dx: number, dy: number): void {
  assert(typeof c === 'object');
  assert(typeof dx === 'number');
  assert(typeof dy === 'number');
  assert(!Number.isNaN(dx));
  assert(!Number.isNaN(dy));
  ensureUserCam(c); const o = c.v.orbit, k = o.dist * 0.0012;
  o.tx -= (Math.cos(o.yaw) * dx + Math.sin(o.yaw) * dy * Math.sin(o.pitch)) * k;
  o.tz -= (-Math.sin(o.yaw) * dx + Math.cos(o.yaw) * dy * Math.sin(o.pitch)) * k;
  c.v.draw(c.v.t);
}
function storyCamera(c: Ctx): void { c.v.userCam = false; c.v.draw(c.v.t); }

// ---- picking and edits
function scaleOf(o: SceneObject): Vec3 { return o.scale ? (Array.isArray(o.scale) ? o.scale : [o.scale, o.scale, o.scale]) : [1, 1, 1]; }
function atOf(o: SceneObject): Vec3 { return o.at ?? [0, 0, 0]; }
function bbox(c: Ctx, o: SceneObject): Vec3[] | null {
  const { M } = c;
  const id = c.v.rootIds.get(o.id); if (id === undefined) return null;
  const s = sizeOf(c, o), sc = scaleOf(o);
  const hw = s[0] * sc[0] / 2, hd = s[2] * sc[2] / 2, hh = s[1] * sc[1];
  const yaw = (o.yaw || 0) * Math.PI / 180, cs = Math.cos(yaw), sn = Math.sin(yaw);
  const cx = M._obj_wx(id), cy = M._obj_wy(id), cz = M._obj_wz(id);
  const pts: Vec3[] = [];
  for (const x of [-hw, hw]) for (const z of [-hd, hd]) for (const y of [0, hh]) pts.push([cx + x * cs + z * sn, cy + y, cz - x * sn + z * cs]);
  return pts;
}
function screenBox(c: Ctx, id: string): { x0: number; y0: number; x1: number; y1: number } | null {
  assert(typeof c === 'object');
  assert(typeof id === 'string');
  assert(id.length < 1e7);
  const o = cur(c).objects.find(x => x.id === id); if (!o) return null;
  const pts = bbox(c, o); if (!pts) return null;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, n = 0;
  for (const p of pts) { const q = c.v.project(p[0], p[1], p[2]); if (!q) continue; n++; x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); }
  return n ? { x0, y0, x1, y1 } : null;
}
function pick(c: Ctx, px: number, py: number): string | null {   // px, py in canvas pixels
  assert(typeof c === 'object');
  assert(typeof px === 'number');
  assert(typeof py === 'number');
  assert(!Number.isNaN(px));
  assert(!Number.isNaN(py));
  let best: string | null = null, area = 1e18;
  for (const o of cur(c).objects) {
    if (o.parent || (o.tags ?? []).includes('floor') || (o.tags ?? []).includes('ceiling')) continue;
    const b = screenBox(c, o.id); if (!b) continue;
    if (px >= b.x0 && px <= b.x1 && py >= b.y0 && py <= b.y1) { const a = (b.x1 - b.x0) * (b.y1 - b.y0); if (a < area) { area = a; best = o.id; } }
  }
  return best;
}
function select(c: Ctx, id: string | null): void { c.v.selected = id; c.v.draw(c.v.t); if (c.v.onchange) c.v.onchange('select'); }
function groundPoint(c: Ctx, px: number, py: number): Vec3 | null {   // ray through the pixel, hit on the plane y = 0
  assert(typeof c === 'object');
  assert(typeof px === 'number');
  assert(typeof py === 'number');
  assert(!Number.isNaN(px));
  assert(!Number.isNaN(py));
  const { M, v } = c;
  const e: Vec3 = [M._cam_x(), M._cam_y(), M._cam_z()];
  const cam = storyCam(c, v.t), t: Vec3 = v.userCam ? [v.orbit.tx, v.orbit.ty, v.orbit.tz] : cam.target;
  const f0: Vec3 = [t[0] - e[0], t[1] - e[1], t[2] - e[2]]; const fl = Math.hypot(...f0);
  const f: Vec3 = [f0[0] / fl, f0[1] / fl, f0[2] / fl];
  const s0: Vec3 = [-f[2], 0, f[0]]; const sl = Math.hypot(...s0) || 1;
  const s: Vec3 = [s0[0] / sl, s0[1] / sl, s0[2] / sl];
  const u: Vec3 = [s[1] * f[2] - s[2] * f[1], s[2] * f[0] - s[0] * f[2], s[0] * f[1] - s[1] * f[0]];
  const tn = Math.tan(cam.fov * Math.PI / 360), nx = (px / c.w * 2 - 1) * tn * c.w / c.h, ny = (1 - py / c.h * 2) * tn;
  const d: Vec3 = [f[0] + s[0] * nx + u[0] * ny, f[1] + s[1] * nx + u[1] * ny, f[2] + s[2] * nx + u[2] * ny];
  if (Math.abs(d[1]) < 1e-4) return null;
  const k = -e[1] / d[1]; if (k < 0) return null;
  return [e[0] + d[0] * k, 0, e[2] + d[2] * k];
}
const snapshot = (c: Ctx): void => { c.v.undo.push(JSON.stringify(c.v.scene)); if (c.v.undo.length > 20) c.v.undo.shift(); };
function undoEdit(c: Ctx): void {
  const s = c.v.undo.pop();
  if (s) {
    const prev: unknown = JSON.parse(s);
    if (!isScene(prev)) throw new Error('viewer: the undo step is not a scene');
    c.v.load(prev); if (c.v.onedit) c.v.onedit();
  }
}
const objOf = (c: Ctx, id: string | null): SceneObject | undefined => cur(c).objects.find(o => o.id === id);
const moveObj = (c: Ctx, o: SceneObject, dx: number, dz: number): void => {
  assert(typeof c === 'object');
  assert(typeof o === 'object');
  assert(typeof dx === 'number');
  const [ax, ay, az] = atOf(o);
  o.at = [ax + dx, ay, az + dz];
  for (const tr of orEmpty(cur(c).tracks)) if (tr.object === o.id && tr.channel === 'at') for (const k of tr.keys) { const w = vec3Of(k.v); if (w) k.v = [w[0] + dx, w[1], w[2] + dz]; }
};
function edit(c: Ctx, op: EditOp, arg?: Vec2 | number): void {
  assert(typeof c === 'object');
  assert(typeof op === 'string');
  assert(op.length < 1e7);
  const o = objOf(c, c.v.selected); if (!o) return;
  const scn = cur(c);
  snapshot(c);
  const sc = scaleOf(o);
  if (op === 'move' && Array.isArray(arg)) moveObj(c, o, arg[0], arg[1]);
  if (op === 'scale' && typeof arg === 'number') { const f = (x: number): number => +(x * arg).toFixed(4); o.scale = [f(sc[0]), f(sc[1]), f(sc[2])]; }
  if (op === 'rotate' && typeof arg === 'number') o.yaw = (((o.yaw || 0) + arg) % 360 + 360) % 360;
  if (op === 'flip') o.flip = !o.flip;
  if (op === 'duplicate') duplicate(c, scn, o);
  if (op === 'delete') {
    scn.objects = scn.objects.filter(x => x.id !== o.id && x.parent !== o.id);
    scn.tracks = (orEmpty(scn.tracks)).filter(tr => tr.object !== o.id);
    c.v.selected = null;
  }
  c.v.load(scn);
  if (c.v.onedit) c.v.onedit();
}
function duplicate(c: Ctx, scn: Scene, o: SceneObject): void {
  assert(typeof c === 'object');
  assert(typeof scn === 'object');
  assert(typeof o === 'object');
  const copy = structuredClone(o); let n = 2; while (objOf(c, `${o.id}-${n}`)) n++;
  const [ax, ay, az] = atOf(o);
  copy.id = `${o.id}-${n}`; copy.at = [ax + 1, ay, az + 1];
  scn.objects.push(copy); c.v.selected = copy.id;
}
// A drag: one undo step at the start, one engine rebuild for each frame, one save at the end.
function beginDrag(c: Ctx): void { if (objOf(c, c.v.selected)) snapshot(c); }
function moveSelectedTo(c: Ctx, gx: number, gz: number): void {
  assert(typeof c === 'object');
  assert(typeof gx === 'number');
  assert(typeof gz === 'number');
  assert(!Number.isNaN(gx));
  assert(!Number.isNaN(gz));
  const o = objOf(c, c.v.selected); if (!o) return;
  const at = atOf(o);
  moveObj(c, o, gx - at[0], gz - at[2]);
  if (!c.dragFrame) c.dragFrame = requestAnimationFrame(() => { c.dragFrame = 0; c.v.load(cur(c)); });
}
function endDrag(c: Ctx): void {
  cancelAnimationFrame(c.dragFrame); c.dragFrame = 0;
  c.v.load(cur(c));
  if (c.v.onedit) c.v.onedit();
}

// ---- playback
const tick = (c: Ctx, now: number): void => {
  const v = c.v;
  if (!v.playing) return;
  const dt = (now - c.last) / 1000; c.last = now;
  const dur = v.scene?.duration ? v.scene.duration : 60;
  let t = v.t + dt;
  // While a sentence plays, the clock moves to the time of its sound by at most 2 ms in each frame.
  // So the picture and the voice stay together, and the picture never jumps.
  for (const k of v.clips) {
    const on = t >= k.start && t < k.end;
    if (on && !k.on) { k.audio.currentTime = t - k.start; k.audio.play().catch(() => { /* the browser may refuse the sound before a touch */ }); }
    if (!on && k.on) k.audio.pause();
    if (on && k.on && !k.audio.paused) t += Math.max(-0.002, Math.min(0.002, k.start + k.audio.currentTime - t));
    k.on = on;
  }
  if (t >= dur) { t = dur; v.playing = false; hush(c); if (v.onchange) v.onchange('end'); }
  v.draw(t);
  if (v.playing) requestAnimationFrame(n => { tick(c, n); });
};
function play(c: Ctx): void {
  const v = c.v;
  if (v.playing) return;
  if (v.scene && v.t >= (v.scene.duration || 60)) v.t = 0;
  v.playing = true; c.last = performance.now(); if (v.onchange) v.onchange('play');
  requestAnimationFrame(n => { tick(c, n); });
}
function pause(c: Ctx): void { c.v.playing = false; hush(c); if (c.v.onchange) c.v.onchange('pause'); }
function seek(c: Ctx, t: number): void { 
  assert(typeof c === 'object');
  assert(typeof t === 'number');
  assert(!Number.isNaN(t));
  hush(c); c.v.draw(Math.max(0, Math.min(t, cur(c).duration || 60))); }
function download(c: Ctx): void {
  const blob = new Blob([JSON.stringify(c.v.scene, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = (cur(c).title || 'scene').replace(/[^\w-]+/g, '-').toLowerCase() + '.toybox.json'; a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); }, 1000);
}
function readPixels(c: Ctx): Uint8Array { const p = c.M._toybox_read_pixels(); return c.M.HEAPU8.subarray(p, p + c.w * c.h * 4); }
