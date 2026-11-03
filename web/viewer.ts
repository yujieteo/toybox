// The Toybox viewer: loads the Goose engine (WebAssembly), feeds it a scene file, draws the
// text overlays, and handles the camera, picking and per-object edits. The authoring app and
// the hosted viewer use this same module. The canvas must have the id "canvas" (the engine
// finds it by that id).
import { poseAt, seedOf, marks } from './vid.js';
import { context2d, isRecord } from './dom.js';

// ---------------------------------------------------------------- types
import type { Vec2, Vec3, Scene, SceneObject, Model, Outfit, Catalogue, Motion, OsmBuilding, SceneMap, TrackValue } from './types.js';
export type { Vec2, Vec3, Scene, SceneObject, Model, Outfit, Catalogue, Motion };
// NEED-TYPE: Callout.at, Callout.estimated, Chapter.estimated, Model.mesh, Model.groups (the viewer reads them through guards below).

// The guards check the outer shape of data that comes from outside (fetch, a file, the undo list).
export function isScene(x: unknown): x is Scene {
  return isRecord(x) && Array.isArray(x.objects);
}
// Fields that the scene format allows but web/types.ts does not name yet.
function flag(x: object, key: string): boolean { return key in x && Reflect.get(x, key) === true; }
function vec3Of(x: unknown): Vec3 | undefined {
  if (!Array.isArray(x) || x.length !== 3) return undefined;
  const [a, b, c] = x;
  return typeof a === 'number' && typeof b === 'number' && typeof c === 'number' ? [a, b, c] : undefined;
}
function numberOf(v: TrackValue): number { return typeof v === 'number' ? v : 0; }
interface Group { color: string; slot?: string }
function meshOf(m: Model): string | undefined { return typeof m.mesh === 'string' ? m.mesh : undefined; }
function groupsOf(m: Model): Group[] {
  const g = m.groups;
  return Array.isArray(g) ? g.filter((x): x is Group => isRecord(x) && typeof x.color === 'string') : [];
}
function isCatalogue(x: unknown): x is Catalogue {
  return isRecord(x) && Array.isArray(x.models) && x.models.every(m => isRecord(m) && typeof m.id === 'string' && Array.isArray(m.size))
    && (x.outfits === undefined || Array.isArray(x.outfits));
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
  const cs = scene.chapters || [];
  if (!cs.some(c => (c.focus || []).includes(id))) return true;
  const c = cs.find(k => k.start <= t && t < k.end) || cs.find(k => k.start <= t && t <= k.end);
  return !!c && (c.focus || []).includes(id);
}
function loadScript(src: string): Promise<void> {
  return new Promise((ok, fail) => {
    const s = document.createElement('script');
    s.src = src; s.onload = () => ok(); s.onerror = () => fail(new Error('cannot load ' + src));
    document.head.appendChild(s);
  });
}

export async function createViewer(opts: ViewerOptions): Promise<Viewer> {
  const { overlay, engineUrl = 'engine/toybox.js', assetsUrl = 'assets' } = opts;
  await loadScript(engineUrl);
  const M = await ToyboxModule({ locateFile: (f: string) => engineUrl.replace(/[^/]*$/, '') + f });
  let W = opts.width || 1280, H = opts.height || 720;
  M._scene_init(W, H);
  const octx = overlay ? context2d(overlay) : null;

  // ---- assets: people meshes and the catalogue
  const up = () => M._toybox_up_buf();
  {
    const sk: unknown = await (await fetch(`${assetsUrl}/people/skel.json`)).json();
    if (!isSkeleton(sk)) throw new Error('The skeleton file has no bones.');
    sk.bones.forEach((b, i) => M._skel_set(i, b.parent, b.head[0], b.head[1], b.head[2]));
    sk.bones.forEach((b, i) => BONES.set(b.name, i));
    const skins: [number, string][] = [[0, 'mesh_full.bin'], [1, 'mesh_lod.bin']];
    for (const [id, f] of skins) {
      const buf = new Uint8Array(await (await fetch(`${assetsUrl}/people/${f}`)).arrayBuffer());
      const [nv0 = 0, nv1 = 0] = new Uint32Array(buf.buffer, 0, 2);
      M.HEAPU8.set(buf.subarray(8), up());
      M._toybox_load_skin(id, nv0, nv1);
    }
  }
  const catalogueData: unknown = await (await fetch(`${assetsUrl}/catalogue.json`)).json();
  if (!isCatalogue(catalogueData)) throw new Error('The catalogue file has no models.');
  const catalogue: Catalogue = catalogueData;
  const models = new Map(catalogue.models.map((m): [string, Model] => [m.id, m]));
  const meshIds = new Map<string, number[]>();   // imported model id -> engine mesh ids
  const outfits = new Map((catalogue.outfits || []).map((f): [string, Outfit] => [f.id, f]));
  // Imported CC0 models (Kenney, Poly Haven): each colour group becomes one engine mesh, ids 16 to 511
  // (0 to 3 are the primitives, 8 to 10 the map buildings, 512 is MAX_MESH in engine/gl_shim.h).
  // File format: see tools/assets/import.ts.
  {
    const meshModels = catalogue.models.filter(m => meshOf(m));
    const files = await Promise.all(meshModels.map(async m => (await fetch(`${assetsUrl}/${meshOf(m)}`)).arrayBuffer()));
    let next = 16;
    meshModels.forEach((m, i) => {
      const buf = nth(files, i), head = new DataView(buf), g = head.getUint32(4, true), s = head.getFloat32(8, true);
      if (head.getUint32(0, true) !== 0x314d4254 || next + g > 512) return;
      const ids: number[] = [];
      let off = 12 + 4 * g;
      for (let k = 0; k < g; k++) {
        const n = head.getUint32(12 + 4 * k, true), q = new Int16Array(buf, off, n * 6), f = new Float32Array(n * 6);
        for (let j = 0; j < f.length; j++) f[j] = j % 6 < 3 ? (q[j] ?? 0) * s : (q[j] ?? 0) / 32767;
        off += n * 12;
        M.HEAPF32.set(f, up() >> 2);
        M._toybox_mesh_upload(next, f.length);
        ids.push(next++);
      }
      meshIds.set(m.id, ids);
    });
  }

  // The methods are function declarations below, so this literal can name them all.
  const v: Viewer = {
    M, catalogue, models, scene: null, t: 0, playing: false, selected: null,
    userCam: false, orbit: { yaw: 0, pitch: 0.4, dist: 12, tx: 0, ty: 1, tz: 0 },
    showOverlay: true, undo: [], onchange: null, onframe: null, onedit: null, exporting: false,
    rootIds: new Map(),   // object id -> engine id
    mapImage: null, logo: null,
    posed: [],            // the objects with motions or a life of their own: { id (engine id), motions, seed, unit, pivot }
    voiceUrl: null,       // file -> URL of a voice file of the narration, or null for no sound
    clips: [],            // the voice of each sentence: { start, end, audio, on }
    tilesReady: Promise.resolve(),
    size, resize, sizeOf, load, oneMap, loadLogo, project, draw, drawOverlay, camState, orbitBy, zoomBy, panBy, storyCamera,
    pick, select, groundPoint, undoEdit, edit, beginDrag, moveSelectedTo, endDrag, play, pause, seek, download, readPixels,
  };
  // The scene that is loaded, or an error when there is none.
  const cur = (): Scene => { if (!v.scene) throw new Error('viewer: no scene is loaded'); return v.scene; };

  function size(): Vec2 { return [W, H]; }
  function resize(w: number, h: number): void {
    W = w; H = h; M._scene_resize(w, h);
    if (overlay) { overlay.width = w; overlay.height = h; }
  }

  // ---- build the engine scene from the scene file
  const flagsOf = (o: SceneObject): number => (o.hidden ? FLAG.hidden : 0) | ((o.tags || []).includes('ceiling') ? FLAG.ceiling : 0) | ((o.tags || []).includes('wall') ? FLAG.wall : 0);
  function add(prim: number, mesh: number, parent: number, flags: number, variant: number, pose: number, flip: boolean | undefined,
    at: Vec3, yaw: number, rot: Vec3, sc: Vec3, c1: Vec3, c2: Vec3, shadow: number): number {
    return M._obj_add(prim, mesh, parent, flags, variant, pose, flip ? 1 : 0, at[0], at[1], at[2], yaw, rot[0], rot[1], rot[2],
      sc[0], sc[1], sc[2], c1[0], c1[1], c1[2], c2[0], c2[1], c2[2], shadow);
  }
  function sizeOf(o: { model: string }): Vec3 { return o.model === 'person' ? PERSON_SIZE : models.get(o.model)?.size || [1, 1, 1]; }

  function load(scene: Scene, keepTime = true): void {
    v.scene = scene;
    if (!keepTime) v.t = 0;
    M._scene_reset();
    v.rootIds.clear();
    const bd: Partial<Scene['backdrop']> = scene.backdrop || {};
    const bc = hexRGB(bd.color || '#9fb88c');
    M._set_backdrop(GROUND[bd.ground || 'grass'] ?? 0, (bd.size || [80, 80])[0], (bd.size || [80, 80])[1], bc[0], bc[1], bc[2]);
    M._set_cutaway(scene.cutaway && scene.cutaway.ceilings ? 1 : 0, scene.cutaway && scene.cutaway.nearWalls ? 1 : 0);
    const done = new Set();
    const addObj = (o: SceneObject): void => {
      if (done.has(o.id)) return;
      done.add(o.id);
      let parent = -1;
      if (o.parent) {
        const po = scene.objects.find(x => x.id === o.parent);
        if (po) { addObj(po); parent = v.rootIds.get(po.id) ?? -1; }
      }
      const at = atOf(o), sc = scaleOf(o);
      const flags = flagsOf(o);
      const structural = (o.tags || []).some(t => t === 'wall' || t === 'floor' || t === 'ceiling');
      if (o.model === 'person') {
        const n = o.variant || 0;
        const fit = o.outfit ? outfits.get(o.outfit) : undefined;
        const col = { ...(fit && fit.colors), ...o.colors };
        const id = add(4, 0, parent, flags, n, POSES[o.pose || 'stand'] ?? 0, o.flip, at, o.yaw || 0, [0, 0, 0], sc,
          hexRGB(col.shirt || SHIRTS[n % SHIRTS.length]), hexRGB(col.pants || PANTS[n % PANTS.length]), 0.32);
        v.rootIds.set(o.id, id);
        for (const p of fit ? fit.parts : []) {
          const prim = PRIMS[p.prim] ?? 0;
          M._obj_bone(add(prim, 0, id, flags, 0, 0, false, p.pos, 0, p.rot || [0, 0, 0], p.size, hexRGB(p.color), [0, 0, 0], 0), BONES.get(p.bone || '') ?? -1);
        }
        return;
      }
      const m = models.get(o.model);
      if (!m) return;
      const shadow = structural || ['road', 'building'].includes(m.kind || '') ? 0 : 0.45 * Math.max(m.size[0], m.size[2]);
      const root = add(6, 0, parent, flags, 0, 0, o.flip, at, o.yaw || 0, [0, 0, 0], sc, [0, 0, 0], [0, 0, 0], shadow);
      v.rootIds.set(o.id, root);
      if (meshOf(m)) (meshIds.get(m.id) || []).forEach((id, k) => {
        const gr = nth(groupsOf(m), k);
        add(5, id, root, flags, 0, 0, false, [0, 0, 0], 0, [0, 0, 0], [1, 1, 1], hexRGB((o.colors && gr.slot && o.colors[gr.slot]) || gr.color), [0, 0, 0], 0);
      });
      else for (const p of m.parts) {
        const c = hexRGB((o.colors && p.slot && o.colors[p.slot]) || p.color);
        const prim = PRIMS[p.prim] ?? 0;
        add(prim, 0, root, flags | (p.eye ? FLAG.eye : 0), 0, 0, false, p.pos, 0, p.rot || [0, 0, 0], p.size, c, [0, 0, 0], 0);
      }
    };
    scene.objects.forEach(addObj);
    v.posed = [];
    for (const o of scene.objects) {
      const motions = (scene.motions || []).filter(m => m.object === o.id), id = v.rootIds.get(o.id);
      const character = (models.get(o.model)?.tags || []).includes('character');
      if (id === undefined || (!motions.length && !character)) continue;
      const size = sizeOf(o), sy = o.scale ? (Array.isArray(o.scale) ? o.scale[1] : o.scale) : 1;
      v.posed.push({ id, motions, seed: character ? seedOf(o.id) : null, unit: size[1] * sy / 2, pivot: size[1] / 2 });
    }
    hush();
    const voiceUrl = v.voiceUrl;
    v.clips = [];
    if (voiceUrl) for (const n of scene.narration || []) {
      if (!n.voice || n.start === undefined || n.end === undefined) continue;
      const url = voiceUrl(n.voice);
      let audio = audios.get(url);
      if (!audio) { audio = Object.assign(new Audio(url), { preload: 'auto' }); audios.set(url, audio); }
      v.clips.push({ start: n.start, end: n.end, audio, on: false });
    }
    for (const tr of scene.tracks || []) {
      const id = v.rootIds.get(tr.object);
      if (id === undefined || !tr.keys.length) continue;
      const ch = CHANNELS[tr.channel];
      if (ch === undefined) continue;
      M._trk_begin(id, ch);
      const ease = (e: string | undefined): number => EASE[e ?? ''] ?? 0;
      for (const k of tr.keys) {
        if (tr.channel === 'at') { const [a, b, c] = vec3Of(k.v) || [0, 0, 0]; M._key_add(k.t, a, b, c, ease(k.ease)); }
        else if (tr.channel === 'yaw') M._key_add(k.t, numberOf(k.v), 0, 0, ease(k.ease));
        else if (tr.channel === 'scale') { const [a, b, c] = vec3Of(k.v) || [numberOf(k.v), numberOf(k.v), numberOf(k.v)]; M._key_add(k.t, a, b, c, ease(k.ease)); }
        else M._key_add(k.t, typeof k.v === 'string' ? POSES[k.v] ?? 0 : 0, 0, 0, 2);
      }
    }
    for (const c of scene.camera || []) M._cam_add(c.t, c.eye[0], c.eye[1], c.eye[2], c.target[0], c.target[1], c.target[2], c.fov || 50, EASE[c.ease ?? ''] ?? 1);
    const looks = scene.lighting && scene.lighting.length ? scene.lighting : [{ t: 0, look: bd.ground === 'floor' ? 'indoor' : 'day' }];
    for (const l of looks) M._light_add(l.t, LOOKS[l.look] ?? 0);
    buildMap(scene);
    v.draw(v.t);
    if (v.onchange) v.onchange('load');
  }

  const audios = new Map<string, HTMLAudioElement>();   // URL -> Audio
  function hush() { for (const c of v.clips) if (c.on) { c.audio.pause(); c.on = false; } }

  // ---- map: OSM footprints extruded, OneMap tiles live
  function ear(poly: Vec2[]): Vec3[] {  // simple ear clipping, poly = [[x,z],...], returns triangles of indices
    const n = poly.length, idx = [...Array(n).keys()], tris: Vec3[] = [];
    let area = 0;
    for (let i = 0; i < n; i++) { const [x1, z1] = nth(poly, i), [x2, z2] = nth(poly, (i + 1) % n); area += x1 * z2 - x2 * z1; }
    if (area < 0) idx.reverse();
    const cross = (a: number, b: number, c: number): number => {
      const pa = nth(poly, a), pb = nth(poly, b), pc = nth(poly, c);
      return (pb[0] - pa[0]) * (pc[1] - pa[1]) - (pb[1] - pa[1]) * (pc[0] - pa[0]);
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
    const p = b.poly.slice();
    if (p.length > 1) { const first = nth(p, 0), end = nth(p, p.length - 1); if (first[0] === end[0] && first[1] === end[1]) p.pop(); }
    if (p.length < 3) return;
    const h = b.height || 9;
    let area = 0;
    for (let i = 0; i < p.length; i++) { const [x1, z1] = nth(p, i), [x2, z2] = nth(p, (i + 1) % p.length); area += x1 * z2 - x2 * z1; }
    const q = area < 0 ? p.slice().reverse() : p;     // counter-clockwise seen from +y with z south
    for (let i = 0; i < q.length; i++) {
      const [x1, z1] = nth(q, i), [x2, z2] = nth(q, (i + 1) % q.length);
      const dx = x2 - x1, dz = z2 - z1, l = Math.hypot(dx, dz) || 1, nx = dz / l, nz = -dx / l;
      const v4: Vec3[] = [[x1, 0, z1], [x2, 0, z2], [x2, h, z2], [x1, h, z1]];
      for (const k of [0, 2, 1, 0, 3, 2]) out.push(...nth(v4, k), nx, 0, nz);
    }
    for (const [a, c, d] of ear(q)) for (const k of [a, d, c]) out.push(nth(q, k)[0], h, nth(q, k)[1], 0, 1, 0);
  }
  let mapGeneration = 0;   // raised at each scene load, so a slow tile load cannot repaint a newer scene
  function buildMap(scene: Scene): Promise<void> {
    const generation = ++mapGeneration;
    const map = scene.map;
    M._ground_map(0, 0, 0, 0, 0);
    v.mapImage = false;
    v.tilesReady = Promise.resolve();
    if (!map) return v.tilesReady;
    if (map.osm && map.osm.buildings && map.osm.buildings.length) {
      const palette: Vec3[] = [[0.86, 0.80, 0.70], [0.78, 0.80, 0.82], [0.84, 0.68, 0.58]];
      const groups: number[][] = [[], [], []];
      map.osm.buildings.forEach((b, i) => extrude(b, nth(groups, i % 3)));
      groups.forEach((g, gi) => {
        if (!g.length || g.length * 4 > M._toybox_up_size()) return;
        M.HEAPF32.set(new Float32Array(g), up() >> 2);
        const mesh = 8 + gi;
        M._toybox_mesh_upload(mesh, g.length);
        const id = add(5, mesh, -1, 0, 0, 0, false, [0, 0, 0], 0, [0, 0, 0], [1, 1, 1], nth(palette, gi), [0, 0, 0], 0);
        v.rootIds.set('__osm' + gi, id);
      });
    }
    // The tiles load from the network. The promise lets the export wait for the map before the
    // first frame. The authoring page does not wait: the map appears when it arrives.
    if (map.origin && v.oneMap(scene)) v.tilesReady = loadTiles(map, map.origin, generation).catch(() => {});
    return v.tilesReady;
  }
  function oneMap(scene: Scene): boolean { return !!(scene.map && scene.map.origin && scene.backdrop?.ground === 'map'); }
  const mercator = (lat: number, lon: number, z: number): Vec2 => {
    const n = 2 ** z, x = (lon + 180) / 360 * n, s = Math.sin(lat * Math.PI / 180);
    return [x, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n];
  };
  async function loadTiles(map: SceneMap, o: { lat: number; lon: number }, generation: number): Promise<void> {
    const om = map.onemap || {}, z = om.zoom || 18, style = om.style || 'Default';
    const [fx, fy] = mercator(o.lat, o.lon, z), cx = Math.floor(fx), cy = Math.floor(fy), R = 1;
    const mPerTile = 156543.03392 * Math.cos(o.lat * Math.PI / 180) / 2 ** z * 256;
    const cv = document.createElement('canvas'); cv.width = cv.height = 256 * (2 * R + 1);
    const g = context2d(cv);
    let any = false;
    await Promise.all([...Array(2 * R + 1).keys()].flatMap(i => [...Array(2 * R + 1).keys()].map(j => new Promise<void>(done => {
      const im = new Image(); im.crossOrigin = 'anonymous';
      im.onload = () => { g.drawImage(im, i * 256, j * 256); any = true; done(); };
      im.onerror = () => done();
      im.src = `https://www.onemap.gov.sg/maps/tiles/${style}/${z}/${cx - R + i}/${cy - R + j}.png`;
    }))));
    if (!any || generation !== mapGeneration) return;
    let d: ImageData;
    try {
      d = g.getImageData(0, 0, cv.width, cv.height);
    } catch { return; }   // a tainted canvas: the tiles stay off
    if (generation !== mapGeneration) return;
    M.HEAPU8.set(d.data, up());
    M._toybox_ground_upload(cv.width, cv.height);
    // metres from the origin: x east, z south
    const x0 = ((cx - R) - fx) * mPerTile, x1 = ((cx + R + 1) - fx) * mPerTile;
    const z0 = ((cy - R) - fy) * mPerTile, z1 = ((cy + R + 1) - fy) * mPerTile;
    M._ground_map(1, x0, z0, x1, z1);
    v.mapImage = true;
    if (v.scene) v.draw(v.t);   // the tiles arrive after the first frame
  }
  function loadLogo(): Promise<void> {
    return new Promise(done => {
      const im = new Image(); im.crossOrigin = 'anonymous';
      im.onload = () => { v.logo = im; done(); }; im.onerror = () => done(); im.src = ONEMAP_LOGO;
    });
  }

  // ---- drawing
  function project(x: number, y: number, z: number): Vec2 | null { return M._project(x, y, z) ? [M._proj_x(), M._proj_y()] : null; }
  function draw(t: number): void {
    v.t = t;
    if (v.userCam) { const o = v.orbit; M._cam_user(1, o.yaw, o.pitch, o.dist, o.tx, o.ty, o.tz); } else M._cam_user(0, 0, 0, 0, 0, 0, 0);
    for (const q of v.posed) {   // the eyes turn at most about 50 degrees to a side and up
      const { dx = 0, z = 0, up: pup = 0, tilt = 0, s = 0, sx = 0, sz = 0, ex = 0, ez = 0, spin = 0, eye = 0 } = poseAt(q.motions, t, q.seed);
      const lim = (x: number, m: number): number => Math.max(-m, Math.min(m, x));
      M._obj_pose(q.id, dx * q.unit, (z + pup) * q.unit, tilt, s * sx, s * sz, lim(1.9 * ex, 0.85) + spin, lim(2.5 * ez, 0.9), eye, q.pivot);
    }
    M._render_frame(t);
    if (octx) { octx.clearRect(0, 0, W, H); if (v.showOverlay) drawOverlay(octx, W, H, t); }
    if (v.onframe) v.onframe(t);
  }

  // Text with small raised and lowered parts (engine/vid.goose). s is the font size, weight the font weight.
  function textW(ctx: CanvasRenderingContext2D, text: string, s: number, weight: number): number {
    let w = 0;
    for (const p of marks(text)) { ctx.font = `${weight} ${p.shift ? s * 0.7 : s}px ${FONT}`; w += ctx.measureText(p.text).width; }
    ctx.font = `${weight} ${s}px ${FONT}`;
    return w;
  }
  function fillText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, s: number, weight: number): void {
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
    const words = text.split(/\s+(?![^{]*\})/), lines: string[] = []; let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (textW(ctx, test, s, weight) > maxW && line) { lines.push(line); line = w; } else line = test;
    }
    if (line) lines.push(line);
    return lines;
  }
  function pill(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string): void {
    ctx.fillStyle = fill; ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill();
  }
  // The "approximate" tag on an estimated chapter, callout or sign. x, y is its top left corner.
  function approx(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): number {
    ctx.font = `600 ${s}px ${FONT}`;
    const tw = ctx.measureText('approximate').width;
    pill(ctx, x, y, tw + s, s * 1.5, s * 0.3, '#f2c14e');
    ctx.fillStyle = '#1c1b18'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('approximate', x + s * 0.5, y + s * 0.75);
    return tw + s;
  }
  const FONT = '"DM Sans", system-ui, sans-serif';
  // The text at least 4 percent of the frame height; white on a dark box (contrast above 4.5 to 1).
  function drawOverlay(ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void {
    const sc = v.scene; if (!sc) return;
    const fs = Math.round(h * 0.045);
    for (const o of sc.objects) {
      const m = models.get(o.model);
      if (!m || m.kind !== 'sign' || !o.label || !signLabelShown(sc, o.id, t)) continue;
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
    // callouts
    for (const c of sc.callouts || []) {
      if (t < c.start || t >= c.end) continue;
      let pos = vec3Of(Reflect.get(c, 'at'));
      if (c.object) { const id = v.rootIds.get(c.object); if (id === undefined) continue; const co = sc.objects.find(o => o.id === c.object); pos = [M._obj_wx(id), M._obj_wy(id) + ((co ? sizeOf(co)[1] : 1) || 1.7), M._obj_wz(id)]; }
      if (!pos) continue;
      const p = v.project(pos[0], pos[1], pos[2]); if (!p) continue;
      const s = Math.round(h * 0.04);
      const lines = wrap(ctx, c.text, w * 0.28, s, 500), lh = s * 1.25;
      const bw = Math.max(...lines.map(l => textW(ctx, l, s, 500))) + s, bh = lines.length * lh + s * 0.6;
      const x = Math.min(w - bw - 8, Math.max(8, p[0] - bw / 2)), y = Math.max(8, p[1] - bh - s * 1.2);
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = Math.max(2, h / 540);
      ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(p[0], y + bh); ctx.stroke();
      pill(ctx, x, y, bw, bh, s * 0.35, 'rgba(20,20,20,0.82)');
      ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      lines.forEach((l, i) => fillText(ctx, l, x + s * 0.5, y + s * 0.3 + i * lh, s, 500));
      if (flag(c, 'estimated') || sc.objects.find(o => o.id === c.object)?.estimated) approx(ctx, x, Math.max(2, y - s * 0.8), s * 0.55);
    }
    // chapter title and clock
    const ch = (sc.chapters || []).find(c => t >= c.start && t < c.end);
    if (ch && (ch.clock || ch.title)) {
      const s = Math.round(h * 0.042);
      const txt = [ch.clock, ch.title].filter(Boolean).join('  ·  ');
      const tw = textW(ctx, txt, s, 600);
      pill(ctx, h * 0.02, h * 0.02, tw + s, s * 1.6, s * 0.4, 'rgba(20,20,20,0.82)');
      ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      fillText(ctx, txt, h * 0.02 + s * 0.5, h * 0.02 + s * 0.8, s, 600);
      if (flag(ch, 'estimated')) approx(ctx, h * 0.02 + tw + s * 1.3, h * 0.02 + s * 0.2, s * 0.8);
    }
    // captions
    const caps = (sc.captions || []).filter(c => t >= c.start && t < c.end);
    if (caps.length) {
      const lines = wrap(ctx, caps.map(c => c.text).join(' '), w * 0.82, fs, 500), lh = fs * 1.25;
      const bw = Math.max(...lines.map(l => textW(ctx, l, fs, 500))) + fs, bh = lines.length * lh + fs * 0.5;
      const nCred = (sc.credits || []).length + (sc.map && sc.map.osm && sc.map.osm.buildings && sc.map.osm.buildings.length ? 1 : 0) + (v.mapImage ? 1 : 0);
      const x = (w - bw) / 2, y = h - bh - h * 0.02 - nCred * h * 0.031 - h * 0.012;
      pill(ctx, x, y, bw, bh, fs * 0.35, 'rgba(20,20,20,0.82)');
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      lines.forEach((l, i) => fillText(ctx, l, w / 2, y + fs * 0.25 + i * lh, fs, 500));
    }
    // credits
    const credits = [...(sc.credits || [])];
    if (sc.map && sc.map.osm && sc.map.osm.buildings && sc.map.osm.buildings.length) credits.push(OSM_CREDIT);
    if (v.mapImage) credits.push(ONEMAP_CREDIT);
    if (credits.length) {
      const s = Math.round(h * 0.022);
      ctx.font = `400 ${s}px ${FONT}`; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
      let y = h - h * 0.01;
      for (const c of credits.reverse()) {
        const tw = ctx.measureText(c).width;
        pill(ctx, w - tw - s * 1.2, y - s * 1.3, tw + s, s * 1.25, s * 0.25, 'rgba(20,20,20,0.6)');
        ctx.fillStyle = '#fff'; ctx.fillText(c, w - s * 0.7, y - s * 0.15); y -= s * 1.4;
      }
      if (v.logo && v.mapImage) ctx.drawImage(v.logo, w - s * 5.5, y - s * 1.8, s * 5, s * 1.8);
    }
    // selection box
    if (v.selected && !v.exporting) {
      const b = screenBox(v.selected);
      if (b) { ctx.strokeStyle = '#e0805c'; ctx.lineWidth = Math.max(2, h / 360); ctx.setLineDash([8, 6]); ctx.strokeRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0); ctx.setLineDash([]); }
    }
  }

  // ---- camera control
  function camState(): { eye: Vec3 } { return { eye: [M._cam_x(), M._cam_y(), M._cam_z()] }; }
  function storyCam(t: number): { target: Vec3; fov: number } {   // the story camera target and fov at time t, as the engine samples them
    const ks = cur().camera || [];
    if (!ks.length) return { target: [0, 1, 0], fov: 50 };
    let a = 0;
    ks.forEach((k, i) => { if (k.t <= t) a = i; });
    const b = Math.min(a + 1, ks.length - 1), A = nth(ks, a), B = nth(ks, b);
    let u = b === a ? 0 : Math.max(0, Math.min(1, (t - A.t) / (B.t - A.t)));
    u = A.ease === 'step' ? 0 : A.ease === 'linear' ? u : u * u * (3 - 2 * u);
    const lerp = (i: 0 | 1 | 2): number => A.target[i] + (B.target[i] - A.target[i]) * u;
    return { target: [lerp(0), lerp(1), lerp(2)], fov: (A.fov || 50) + ((B.fov || 50) - (A.fov || 50)) * u };
  }
  function ensureUserCam(): void {
    if (v.userCam) return;
    // start from the story camera: look from the current eye at its target
    const e: Vec3 = [M._cam_x(), M._cam_y(), M._cam_z()];
    const tg = storyCam(v.t).target;
    const dx = e[0] - tg[0], dy = e[1] - tg[1], dz = e[2] - tg[2];
    const d = Math.hypot(dx, dy, dz) || 10;
    v.orbit = { yaw: Math.atan2(dx, dz), pitch: Math.asin(Math.max(-1, Math.min(1, dy / d))), dist: d, tx: tg[0], ty: tg[1], tz: tg[2] };
    v.userCam = true;
  }
  function orbitBy(dyaw: number, dpitch: number): void { ensureUserCam(); const o = v.orbit; o.yaw -= dyaw; o.pitch = Math.max(-0.2, Math.min(1.5, o.pitch + dpitch)); v.draw(v.t); }
  function zoomBy(f: number): void { ensureUserCam(); const o = v.orbit; o.dist = Math.max(1.5, Math.min(300, o.dist * f)); v.draw(v.t); }
  function panBy(dx: number, dy: number): void {
    ensureUserCam(); const o = v.orbit, k = o.dist * 0.0012;
    o.tx -= (Math.cos(o.yaw) * dx + Math.sin(o.yaw) * dy * Math.sin(o.pitch)) * k;
    o.tz -= (-Math.sin(o.yaw) * dx + Math.cos(o.yaw) * dy * Math.sin(o.pitch)) * k;
    v.draw(v.t);
  }
  function storyCamera(): void { v.userCam = false; v.draw(v.t); }

  // ---- picking and edits
  function scaleOf(o: SceneObject): Vec3 { return o.scale ? (Array.isArray(o.scale) ? o.scale : [o.scale, o.scale, o.scale]) : [1, 1, 1]; }
  function atOf(o: SceneObject): Vec3 { return o.at || [0, 0, 0]; }
  function bbox(o: SceneObject): Vec3[] | null {
    const id = v.rootIds.get(o.id); if (id === undefined) return null;
    const s = sizeOf(o), sc = scaleOf(o);
    const hw = s[0] * sc[0] / 2, hd = s[2] * sc[2] / 2, hh = s[1] * sc[1];
    const yaw = (o.yaw || 0) * Math.PI / 180, c = Math.cos(yaw), sn = Math.sin(yaw);
    const cx = M._obj_wx(id), cy = M._obj_wy(id), cz = M._obj_wz(id);
    const pts: Vec3[] = [];
    for (const x of [-hw, hw]) for (const z of [-hd, hd]) for (const y of [0, hh]) pts.push([cx + x * c + z * sn, cy + y, cz - x * sn + z * c]);
    return pts;
  }
  function screenBox(id: string): { x0: number; y0: number; x1: number; y1: number } | null {
    const o = cur().objects.find(x => x.id === id); if (!o) return null;
    const pts = bbox(o); if (!pts) return null;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, n = 0;
    for (const p of pts) { const q = v.project(p[0], p[1], p[2]); if (!q) continue; n++; x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); }
    return n ? { x0, y0, x1, y1 } : null;
  }
  function pick(px: number, py: number): string | null {   // px, py in canvas pixels
    let best: string | null = null, area = 1e18;
    for (const o of cur().objects) {
      if (o.parent || (o.tags || []).includes('floor') || (o.tags || []).includes('ceiling')) continue;
      const b = screenBox(o.id); if (!b) continue;
      if (px >= b.x0 && px <= b.x1 && py >= b.y0 && py <= b.y1) { const a = (b.x1 - b.x0) * (b.y1 - b.y0); if (a < area) { area = a; best = o.id; } }
    }
    return best;
  }
  function select(id: string | null): void { v.selected = id; v.draw(v.t); if (v.onchange) v.onchange('select'); }
  function groundPoint(px: number, py: number): Vec3 | null {   // ray through the pixel, hit on the plane y = 0
    const e: Vec3 = [M._cam_x(), M._cam_y(), M._cam_z()];
    const cam = storyCam(v.t), t: Vec3 = v.userCam ? [v.orbit.tx, v.orbit.ty, v.orbit.tz] : cam.target;
    const f0: Vec3 = [t[0] - e[0], t[1] - e[1], t[2] - e[2]]; const fl = Math.hypot(...f0);
    const f: Vec3 = [f0[0] / fl, f0[1] / fl, f0[2] / fl];
    const s0: Vec3 = [-f[2], 0, f[0]]; const sl = Math.hypot(...s0) || 1;
    const s: Vec3 = [s0[0] / sl, s0[1] / sl, s0[2] / sl];
    const u: Vec3 = [s[1] * f[2] - s[2] * f[1], s[2] * f[0] - s[0] * f[2], s[0] * f[1] - s[1] * f[0]];
    const tn = Math.tan(cam.fov * Math.PI / 360), nx = (px / W * 2 - 1) * tn * W / H, ny = (1 - py / H * 2) * tn;
    const d: Vec3 = [f[0] + s[0] * nx + u[0] * ny, f[1] + s[1] * nx + u[1] * ny, f[2] + s[2] * nx + u[2] * ny];
    if (Math.abs(d[1]) < 1e-4) return null;
    const k = -e[1] / d[1]; if (k < 0) return null;
    return [e[0] + d[0] * k, 0, e[2] + d[2] * k];
  }
  const snapshot = (): void => { v.undo.push(JSON.stringify(v.scene)); if (v.undo.length > 20) v.undo.shift(); };
  function undoEdit(): void {
    const s = v.undo.pop();
    if (s) {
      const prev: unknown = JSON.parse(s);
      if (!isScene(prev)) throw new Error('viewer: the undo step is not a scene');
      v.load(prev); if (v.onedit) v.onedit();
    }
  }
  const objOf = (id: string | null): SceneObject | undefined => cur().objects.find(o => o.id === id);
  const moveObj = (o: SceneObject, dx: number, dz: number): void => {
    const [ax, ay, az] = atOf(o);
    o.at = [ax + dx, ay, az + dz];
    for (const tr of cur().tracks || []) if (tr.object === o.id && tr.channel === 'at') for (const k of tr.keys) { const w = vec3Of(k.v); if (w) k.v = [w[0] + dx, w[1], w[2] + dz]; }
  };
  function edit(op: 'move', arg: Vec2): void;
  function edit(op: 'scale' | 'rotate', arg: number): void;
  function edit(op: 'flip' | 'duplicate' | 'delete'): void;
  function edit(op: 'move' | 'scale' | 'rotate' | 'flip' | 'duplicate' | 'delete', arg?: Vec2 | number): void {
    const o = objOf(v.selected); if (!o) return;
    const scn = cur();
    snapshot();
    const sc = scaleOf(o);
    if (op === 'move' && Array.isArray(arg)) moveObj(o, arg[0], arg[1]);
    if (op === 'scale' && typeof arg === 'number') { const f = (x: number): number => +(x * arg).toFixed(4); o.scale = [f(sc[0]), f(sc[1]), f(sc[2])]; }
    if (op === 'rotate' && typeof arg === 'number') o.yaw = (((o.yaw || 0) + arg) % 360 + 360) % 360;
    if (op === 'flip') o.flip = !o.flip;
    if (op === 'duplicate') {
      const c = structuredClone(o); let n = 2; while (objOf(`${o.id}-${n}`)) n++;
      const [ax, ay, az] = atOf(o);
      c.id = `${o.id}-${n}`; c.at = [ax + 1, ay, az + 1];
      scn.objects.push(c); v.selected = c.id;
    }
    if (op === 'delete') {
      scn.objects = scn.objects.filter(x => x.id !== o.id && x.parent !== o.id);
      scn.tracks = (scn.tracks || []).filter(tr => tr.object !== o.id);
      v.selected = null;
    }
    v.load(scn);
    if (v.onedit) v.onedit();
  }
  // A drag: one undo step at the start, one engine rebuild for each frame, one save at the end.
  let dragFrame = 0;
  function beginDrag(): void { if (objOf(v.selected)) snapshot(); }
  function moveSelectedTo(gx: number, gz: number): void {
    const o = objOf(v.selected); if (!o) return;
    const at = atOf(o);
    moveObj(o, gx - at[0], gz - at[2]);
    if (!dragFrame) dragFrame = requestAnimationFrame(() => { dragFrame = 0; v.load(cur()); });
  }
  function endDrag(): void {
    cancelAnimationFrame(dragFrame); dragFrame = 0;
    v.load(cur());
    if (v.onedit) v.onedit();
  }

  // ---- playback
  let last = 0;
  const tick = (now: number): void => {
    if (!v.playing) return;
    const dt = (now - last) / 1000; last = now;
    const dur = v.scene && v.scene.duration ? v.scene.duration : 60;
    let t = v.t + dt;
    // While a sentence plays, the clock moves to the time of its sound by at most 2 ms in each frame.
    // So the picture and the voice stay together, and the picture never jumps.
    for (const c of v.clips) {
      const on = t >= c.start && t < c.end;
      if (on && !c.on) { c.audio.currentTime = t - c.start; c.audio.play().catch(() => {}); }
      if (!on && c.on) c.audio.pause();
      if (on && c.on && !c.audio.paused) t += Math.max(-0.002, Math.min(0.002, c.start + c.audio.currentTime - t));
      c.on = on;
    }
    if (t >= dur) { t = dur; v.playing = false; hush(); if (v.onchange) v.onchange('end'); }
    v.draw(t);
    if (v.playing) requestAnimationFrame(tick);
  };
  function play(): void { if (v.playing) return; if (v.scene && v.t >= (v.scene.duration || 60)) v.t = 0; v.playing = true; last = performance.now(); if (v.onchange) v.onchange('play'); requestAnimationFrame(tick); }
  function pause(): void { v.playing = false; hush(); if (v.onchange) v.onchange('pause'); }
  function seek(t: number): void { hush(); v.draw(Math.max(0, Math.min(t, cur().duration || 60))); }
  function download(): void {
    const blob = new Blob([JSON.stringify(v.scene, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = (cur().title || 'scene').replace(/[^\w-]+/g, '-').toLowerCase() + '.toybox.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function readPixels(): Uint8Array { const p = M._toybox_read_pixels(); return M.HEAPU8.subarray(p, p + W * H * 4); }
  return v;
}
