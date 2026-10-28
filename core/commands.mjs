// One function per tool: (scene, args, ctx) => { ok: true, result } | { ok: false, errors: [{code, message}] }
// A command changes the scene only when the result is valid.
import { writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, relative, isAbsolute, basename } from 'node:path';
import { newScene, validate, loadCatalogue, objectBounds, srt, saveScene, valueAt, trackOf, stateAt, boundsVisible,
  HARD_CODES, POSES, SHOTS, LOOKS, GROUNDS, CHANNELS, EASES, ASPECT, sub, dot, cross, norm } from './scene.mjs';
import { rotYaw } from './geom.mjs';
import { parseOverpass, toMapBlock, writeOdbl } from './osm.mjs';

class Fail extends Error { constructor(code, message) { super(message); this.code = code; } }
const fail = (errors) => ({ ok: false, errors });
const okr = (result) => ({ ok: true, result });
const D = Math.PI / 180;
const r2 = (v) => Math.round(v * 1000) / 1000;

// ---------- JSON Schema pieces and a small argument checker
const num = { type: 'number' };
const str = { type: 'string' };
const vec3 = { type: 'array', items: num, minItems: 3, maxItems: 3 };
const vecXZ = { description: '[x, z] (y is 0) or [x, y, z] in metres. x is east, z is south.', type: 'array', items: num, minItems: 2, maxItems: 3 };
const strArr = { type: 'array', items: str };
const common = {
  id: { type: 'string', description: 'Object id. Auto-made when omitted.' },
  label: { type: 'string' }, tags: strArr,
  source: { type: 'string', description: 'Where the claim comes from (URL or text). Start with "estimated" for a guess.' },
  estimated: { type: 'boolean', description: 'True when no source gives this value.' },
  measured: { type: 'boolean', description: 'True when the value is a measured fact. Needs source.' },
};

export function checkArgs(schema, v, path = 'args') {
  const errs = [];
  const e = (m) => errs.push({ code: 'bad_args', message: `${path}: ${m}` });
  if (schema.anyOf) {
    if (!schema.anyOf.some((s) => checkArgs(s, v, path).length === 0)) e('does not match any allowed form.');
    return errs;
  }
  const t = schema.type;
  if (t === 'string' && typeof v !== 'string') e('must be a string.');
  else if (t === 'number' && (typeof v !== 'number' || !Number.isFinite(v))) e('must be a number.');
  else if (t === 'integer' && !Number.isInteger(v)) e('must be an integer.');
  else if (t === 'boolean' && typeof v !== 'boolean') e('must be a boolean.');
  else if (t === 'array') {
    if (!Array.isArray(v)) e('must be an array.');
    else {
      if (schema.minItems !== undefined && v.length < schema.minItems) e(`needs at least ${schema.minItems} items.`);
      if (schema.maxItems !== undefined && v.length > schema.maxItems) e(`needs at most ${schema.maxItems} items.`);
      if (schema.items) v.forEach((x, i) => errs.push(...checkArgs(schema.items, x, `${path}[${i}]`)));
    }
  } else if (t === 'object') {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) e('must be an object.');
    else {
      for (const k of schema.required || []) if (v[k] === undefined) errs.push({ code: 'bad_args', message: `${path}.${k}: is required.` });
      for (const [k, s] of Object.entries(schema.properties || {})) if (v[k] !== undefined && v[k] !== null) errs.push(...checkArgs(s, v[k], `${path}.${k}`));
      if (schema.additionalProperties === false) for (const k of Object.keys(v)) if (!schema.properties?.[k]) errs.push({ code: 'bad_args', message: `${path}.${k}: unknown argument.` });
    }
  }
  if (schema.enum && !schema.enum.includes(v)) e(`must be one of ${schema.enum.join(', ')}.`);
  if (schema.minimum !== undefined && typeof v === 'number' && v < schema.minimum) e(`must be at least ${schema.minimum}.`);
  return errs;
}

// ---------- helpers
function cloneScene(s) { return structuredClone(s); }
function replaceScene(target, src) { for (const k of Object.keys(target)) delete target[k]; Object.assign(target, src); }
function maxTime(s) {
  let m = 0;
  for (const t of s.tracks || []) for (const k of t.keys) m = Math.max(m, k.t);
  for (const k of s.camera || []) m = Math.max(m, k.t);
  for (const k of s.lighting || []) m = Math.max(m, k.t);
  for (const k of [...(s.chapters || []), ...(s.captions || []), ...(s.callouts || [])]) m = Math.max(m, k.end);
  return m;
}
const errKey = (e) => `${e.code}|${e.message}`;
const hardErrors = (errs) => errs.filter((e) => HARD_CODES.has(e.code));

// Apply fn to a copy. Keep the copy only if it adds no new hard validation error.
function mutate(scene, ctx, fn) {
  const cat = ctx?.catalogue || loadCatalogue();
  const copy = cloneScene(scene);
  let result;
  try { result = fn(copy, cat); } catch (e) { if (e instanceof Fail) return fail([{ code: e.code, message: e.message }]); throw e; }
  copy.duration = Math.max(copy.duration || 0, r2(maxTime(copy)));
  const after = hardErrors(validate(copy, cat));
  if (after.length) {
    const before = new Set(hardErrors(validate(scene, cat)).map(errKey));
    const added = after.filter((e) => !before.has(errKey(e)));
    if (added.length) {
      const shown = added.slice(0, 8).map((e) => ({ code: e.code, message: e.message, path: e.path }));
      if (added.length > 8) shown.push({ code: 'more_errors', message: `${added.length - 8} more errors not shown.` });
      return fail(shown);
    }
  }
  replaceScene(scene, copy);
  return okr(result);
}

const find = (s, id) => { const o = s.objects.find((x) => x.id === id); if (!o) throw new Fail('unknown_object', `No object with id "${id}".`); return o; };
function modelOrFail(cat, model) {
  if (model === 'person') return null;
  const m = cat.models.find((x) => x.id === model);
  if (!m) {
    const near = cat.models.filter((x) => x.id.includes(String(model).split('-')[0]) || x.name.toLowerCase().includes(String(model).toLowerCase())).slice(0, 5).map((x) => x.id);
    throw new Fail('unknown_model', `Unknown model "${model}".${near.length ? ` Did you mean: ${near.join(', ')}?` : ' Use list_models to find ids.'}`);
  }
  return m;
}
function uniqueId(s, base) {
  const used = new Set(s.objects.map((o) => o.id));
  if (!used.has(base) && base !== 'person') return base;
  let n = 1; while (used.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}
const at3 = (a, y0 = 0) => (a.length === 2 ? [a[0], y0, a[1]] : [...a]);
const scaleOf = (v) => (v === undefined ? [1, 1, 1] : typeof v === 'number' ? [v, v, v] : v);
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const SHIRTS = ['#c8553d', '#3f6e9a', '#d9b44a', '#6f9a6a', '#a99bb8', '#e8dcc0', '#5f9ea0', '#b8765f', '#8c8c86'];
const PANTS = ['#3a3f47', '#4a5568', '#6b5b4b', '#2f4a6b', '#55595f'];

function makeObject(s, cat, a, extra = {}) {
  modelOrFail(cat, a.model);
  const person = a.model === 'person';
  const id = a.id || uniqueId(s, person ? 'p' : a.model);
  const o = { id, model: a.model };
  if (person) o.variant = a.variant ?? (s.objects.filter((x) => x.model === 'person').length % 24);
  o.at = extra.at ?? at3(a.at);
  o.yaw = a.yaw ?? 0;
  o.scale = scaleOf(a.scale);
  o.flip = !!a.flip;
  if (a.colors) o.colors = a.colors;
  if (person) o.pose = a.pose || 'stand';
  else if (a.pose) o.pose = a.pose;
  o.tags = a.tags || [];
  o.label = a.label || '';
  o.parent = null;
  o.source = a.source || '';
  o.estimated = !!a.estimated;
  if (a.measured !== undefined) o.measured = a.measured;
  o.hidden = false;
  return o;
}
const placeProps = {
  model: { type: 'string', description: 'Catalogue id (see list_models) or "person".' },
  at: vecXZ, yaw: { type: 'number', description: 'Degrees, counter-clockwise from above. 0 faces +z (south), 90 faces +x (east), 180 faces north, 270 faces west.' },
  scale: { anyOf: [num, vec3] }, flip: { type: 'boolean' }, colors: { type: 'object', description: 'Slot to hex colour. A person uses shirt and pants.' },
  variant: { type: 'integer', minimum: 0, description: 'Person face and body, 0 to 23.' }, pose: { type: 'string', enum: POSES },
  ...common,
};

// ---------- camera framing
const SHOT_PARAMS = {
  wide: { elev: 28, az: 20, margin: 1.3, min: 10 },
  medium: { elev: 14, az: 20, margin: 1.2, min: 5 },
  close: { elev: 6, az: 15, margin: 1.15, min: 2.2 },
  top: { elev: 85, az: 0, margin: 1.25, min: 8 },
  follow: { elev: 12, az: 0, margin: 1.3, min: 4 },
  orbit: { elev: 20, az: 0, margin: 1.3, min: 8 },
};
export function frameCamera(scene, cat, ids, shot, t, opts = {}) {
  const bt = objectBounds(scene, cat, t);
  const bs = ids.map((id) => { if (!bt[id]) throw new Fail('unknown_object', `Cannot frame "${id}": no such object.`); return bt[id]; });
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  const pts = [];
  for (const b of bs) for (const y of [b.min[1], b.max[1]]) for (const c of b.corners) {
    pts.push([c[0], y, c[1]]);
    for (let i = 0; i < 3; i++) { const v = [c[0], y, c[1]][i]; min[i] = Math.min(min[i], v); max[i] = Math.max(max[i], v); }
  }
  const P = SHOT_PARAMS[shot];
  const center = min.map((v, i) => (v + max[i]) / 2);
  if (shot === 'close') center[1] = Math.max(center[1], min[1] + 0.7 * (max[1] - min[1]));
  let az = opts.view ?? P.az;
  if (shot === 'follow' && opts.view === undefined) az = (bs[0].yaw ?? 0) + 180;
  const el = opts.elevation ?? P.elev, fov = opts.fov ?? 50, margin = opts.margin ?? P.margin;
  const dir = [Math.sin(az * D) * Math.cos(el * D), Math.sin(el * D), Math.cos(az * D) * Math.cos(el * D)];
  const f = dir.map((v) => -v);
  const right = norm(cross(f, [0, 1, 0])), up = cross(right, f);
  const tanV = Math.tan((fov * D) / 2), tanH = tanV * ASPECT;
  let d = opts.distance ?? P.min;
  if (opts.distance === undefined) {
    for (const p of pts) {
      const q = sub(p, center);
      d = Math.max(d, (margin * Math.abs(dot(q, right))) / tanH - dot(q, f), (margin * Math.abs(dot(q, up))) / tanV - dot(q, f));
    }
  }
  return { eye: center.map((v, i) => r2(v + dir[i] * d)), target: center.map(r2), fov, distance: r2(d) };
}

// ---------- key helpers
function mergeKeys(scene, id, channel, keys, holdBefore) {
  let tr = trackOf(scene, id, channel);
  if (!tr) { tr = { object: id, channel, keys: [] }; scene.tracks.push(tr); }
  const t0 = keys[0].t, t1 = keys[keys.length - 1].t;
  tr.keys = tr.keys.filter((k) => k.t < t0 - 1e-9 || k.t > t1 + 1e-9);
  const before = [...tr.keys].reverse().find((k) => k.t < t0);
  if (before && holdBefore) before.ease = 'step';
  tr.keys.push(...keys);
  tr.keys.sort((a, b) => a.t - b.t);
}
function wrapYaw(prev, y) { let d = (y - prev) % 360; if (d > 180) d -= 360; if (d < -180) d += 360; return prev + d; }

// ---------- tools
const tools = [];
function def(name, description, properties, required, fn) {
  const inputSchema = { type: 'object', properties, required, additionalProperties: false };
  const run = (scene, args = {}, ctx = {}) => {
    const errs = checkArgs(inputSchema, args || {});
    if (errs.length) return fail(errs);
    try { return fn(scene, args || {}, ctx || {}); } catch (e) { if (e instanceof Fail) return fail([{ code: e.code, message: e.message }]); throw e; }
  };
  tools.push({ name, description, inputSchema, run });
}

def('list_models', 'List catalogue models. Filter by words in the id, name or tags, and by kind. "person" is always available (variant 0 to 23).',
  { query: str, kind: { type: 'string', enum: ['vehicle', 'building', 'furniture', 'structure', 'prop', 'sign', 'road', 'nature', 'person'] } }, [],
  (scene, a, ctx) => {
    const cat = ctx.catalogue || loadCatalogue();
    const words = (a.query || '').toLowerCase().split(/\s+/).filter(Boolean);
    const rows = cat.models.map((m) => ({ id: m.id, name: m.name, kind: m.kind, size: m.size, tags: m.tags || [] }));
    rows.unshift({ id: 'person', name: 'Person (variant 0 to 23, poses: ' + POSES.join(', ') + ')', kind: 'person', size: [0.5, 1.75, 0.35], tags: ['people', 'human'] });
    const out = rows.filter((m) => (!a.kind || m.kind === a.kind) && words.every((w) => `${m.id} ${m.name} ${m.tags.join(' ')}`.toLowerCase().includes(w)));
    return okr({ count: out.length, models: out });
  });

def('new_scene', 'Start a new empty scene. This replaces the current scene.',
  { title: str, author: str, ground: { type: 'string', enum: GROUNDS }, look: { type: 'string', enum: LOOKS }, size: { type: 'array', items: num, minItems: 2, maxItems: 2 }, color: str },
  [], (scene, a) => { replaceScene(scene, newScene(a)); return okr({ title: scene.title }); });

def('get_scene', 'Read the scene. By default it returns a summary with every object id. Pass full true for the whole file.',
  { full: { type: 'boolean' } }, [], (scene, a) => {
    if (a.full) return okr(scene);
    return okr({
      title: scene.title, duration: scene.duration, backdrop: scene.backdrop, lighting: scene.lighting, map: scene.map ? { origin: scene.map.origin, osm: scene.map.osm ? `${scene.map.osm.buildings?.length || 0} buildings` : undefined } : undefined,
      counts: { objects: scene.objects.length, tracks: scene.tracks.length, camera: scene.camera.length, chapters: scene.chapters.length, captions: scene.captions.length, callouts: scene.callouts.length },
      objects: scene.objects.map((o) => ({ id: o.id, model: o.model, at: o.at, yaw: o.yaw, label: o.label || undefined, tags: o.tags?.length ? o.tags : undefined })),
      chapters: scene.chapters.map((c) => ({ id: c.id, start: c.start, end: c.end, title: c.title, shot: c.shot })),
      camera: scene.camera.map((k) => ({ t: k.t, shot: k.shot, ease: k.ease })),
    });
  });

def('place', 'Place one model at a position. Returns the object id.', placeProps, ['model', 'at'],
  (scene, a, ctx) => mutate(scene, ctx, (s, cat) => { const o = makeObject(s, cat, a); s.objects.push(o); return { id: o.id }; }));

def('place_near', 'Place a model near another object. offset is [dx, dz] or [dx, dy, dz] in metres from that object.',
  { ...placeProps, near: { type: 'string', description: 'Id of the object to place beside.' }, offset: { type: 'array', items: num, minItems: 2, maxItems: 3 } }, ['model', 'near'],
  (scene, a, ctx) => mutate(scene, ctx, (s, cat) => {
    const n = find(s, a.near);
    const off = a.offset ? at3(a.offset) : [1.5, 0, 0];
    const o = makeObject(s, cat, a, { at: [0, 1, 2].map((i) => r2(n.at[i] + off[i])) });
    s.objects.push(o); return { id: o.id, at: o.at };
  }));

def('place_group', 'Place many models in a line, grid, ring or scatter. Same seed gives the same result. For "person" it picks variants, poses and clothes from the seed.',
  { ...placeProps, count: { type: 'integer', minimum: 1 }, pattern: { type: 'string', enum: ['line', 'grid', 'ring', 'scatter'] }, spacing: num, seed: { type: 'integer' },
    variants: { type: 'array', items: { type: 'integer' }, description: 'Person variants to draw from.' }, poses: { type: 'array', items: { type: 'string', enum: POSES } },
    angle: { type: 'number', description: 'Line or grid direction in degrees (0 = along +x).' }, cols: { type: 'integer', minimum: 1 }, radius: num,
    area: { type: 'array', items: num, minItems: 2, maxItems: 2, description: 'Scatter area [width, depth].' }, face: { type: 'string', enum: ['center', 'out', 'none'] } },
  ['model', 'count', 'at'],
  (scene, a, ctx) => mutate(scene, ctx, (s, cat) => {
    modelOrFail(cat, a.model);
    if (a.count > 500) throw new Fail('bad_args', 'count must be 500 or fewer.');
    const rng = mulberry32(a.seed ?? 1), n = a.count, sp = a.spacing ?? 1.2, c = at3(a.at), person = a.model === 'person';
    const pts = [];
    const dirv = rotYaw([1, 0, 0], a.angle ?? 0), dirz = rotYaw([0, 0, 1], a.angle ?? 0);
    if (a.pattern === 'line' || !a.pattern) for (let i = 0; i < n; i++) pts.push({ p: [c[0] + dirv[0] * i * sp, c[1], c[2] + dirv[2] * i * sp] });
    else if (a.pattern === 'grid') { const cols = a.cols ?? Math.ceil(Math.sqrt(n)); for (let i = 0; i < n; i++) { const x = (i % cols) * sp, z = Math.floor(i / cols) * sp; pts.push({ p: [c[0] + dirv[0] * x + dirz[0] * z, c[1], c[2] + dirv[2] * x + dirz[2] * z] }); } }
    else if (a.pattern === 'ring') {
      const rad = a.radius ?? Math.max(sp * n / (2 * Math.PI), 0.3);
      for (let i = 0; i < n; i++) { const th = (i / n) * 2 * Math.PI; const face = a.face ?? 'center'; pts.push({ p: [c[0] + Math.sin(th) * rad, c[1], c[2] + Math.cos(th) * rad], yaw: face === 'none' ? undefined : (th / D + (face === 'center' ? 180 : 0)) % 360 }); }
    } else {
      const [w, d] = a.area ?? [Math.sqrt(n) * sp * 1.5, Math.sqrt(n) * sp * 1.5];
      for (let i = 0; i < n; i++) {
        let best = null;
        for (let k = 0; k < 30; k++) {
          const p = [c[0] + (rng() - 0.5) * w, c[1], c[2] + (rng() - 0.5) * d];
          best = p;
          if (pts.every((q) => Math.hypot(q.p[0] - p[0], q.p[2] - p[2]) >= sp * 0.8)) break;
        }
        pts.push({ p: best, yaw: rng() * 360 });
      }
    }
    const base = a.id || a.model;
    const ids = [];
    pts.forEach((pt, i) => {
      const v = person ? (a.variants?.length ? a.variants[Math.floor(rng() * a.variants.length)] : Math.floor(rng() * 24)) : undefined;
      const colors = a.colors || (person ? { shirt: SHIRTS[Math.floor(rng() * SHIRTS.length)], pants: PANTS[Math.floor(rng() * PANTS.length)] } : undefined);
      const pose = a.poses?.length ? a.poses[Math.floor(rng() * a.poses.length)] : a.pose;
      const o = makeObject(s, cat, { ...a, id: uniqueId(s, `${base}-${i + 1}`), variant: v, colors, pose, yaw: pt.yaw ?? a.yaw ?? 0, tags: [...(a.tags || []), `group:${base}`] }, { at: pt.p.map(r2) });
      s.objects.push(o); ids.push(o.id);
    });
    return { count: ids.length, ids };
  }));

def('transform', 'Move, turn, scale or flip an existing object.', { id: str, at: vecXZ, yaw: num, scale: { anyOf: [num, vec3] }, flip: { type: 'boolean' } }, ['id'],
  (scene, a, ctx) => mutate(scene, ctx, (s) => {
    const o = find(s, a.id);
    if (a.at) o.at = at3(a.at, o.at[1]);
    if (a.yaw !== undefined) o.yaw = a.yaw;
    if (a.scale !== undefined) o.scale = scaleOf(a.scale);
    if (a.flip !== undefined) o.flip = a.flip;
    return { id: o.id, at: o.at, yaw: o.yaw };
  }));

def('duplicate', 'Copy an object. Each copy moves by offset more than the last.', { id: str, count: { type: 'integer', minimum: 1 }, offset: { type: 'array', items: num, minItems: 2, maxItems: 3 } }, ['id'],
  (scene, a, ctx) => mutate(scene, ctx, (s) => {
    const o = find(s, a.id), off = a.offset ? at3(a.offset) : [1.5, 0, 0], ids = [];
    for (let i = 1; i <= (a.count ?? 1); i++) {
      const c = structuredClone(o); c.id = uniqueId(s, `${o.id}-copy`); c.at = [0, 1, 2].map((k) => r2(o.at[k] + off[k] * i)); s.objects.push(c); ids.push(c.id);
    }
    return { ids };
  }));

def('remove', 'Remove an object, its animation tracks and its children.', { id: str }, ['id'],
  (scene, a, ctx) => mutate(scene, ctx, (s) => {
    find(s, a.id);
    const gone = new Set([a.id]);
    let grew = true; while (grew) { grew = false; for (const o of s.objects) if (o.parent && gone.has(o.parent) && !gone.has(o.id)) { gone.add(o.id); grew = true; } }
    s.objects = s.objects.filter((o) => !gone.has(o.id));
    s.tracks = s.tracks.filter((t) => !gone.has(t.object));
    for (const c of s.chapters) if (c.focus) c.focus = c.focus.filter((f) => !gone.has(f));
    s.callouts = s.callouts.filter((c) => !gone.has(c.object));
    return { removed: [...gone] };
  }));

const openingSchema = { type: 'object', required: ['wall', 'at'], properties: { wall: { type: 'string', enum: ['n', 's', 'e', 'w'] }, at: { type: 'number', description: 'Centre of the gap in metres along the wall, from its west end (n, s) or north end (e, w).' }, width: num } };
def('build_room', 'Build a room from wall, floor and ceiling objects. at is the floor centre [x, y, z]. size is [width (x), depth (z), height]. Walls n, s, e, w face outward (yaw 180, 0, 90, 270) and carry the wall tag.',
  { id: str, at: vecXZ, size: vec3, doors: { type: 'array', items: openingSchema }, windows: { type: 'array', items: openingSchema }, floor: { type: 'boolean' }, ceiling: { type: 'boolean' }, source: common.source, estimated: common.estimated },
  ['id', 'at', 'size'],
  (scene, a, ctx) => mutate(scene, ctx, (s, cat) => {
    const [w, d, h] = a.size, c = at3(a.at), T = 0.15, made = [];
    const meta = { source: a.source || '', estimated: !!a.estimated };
    const push = (model, id, pos, yaw, scale, tags) => { const o = makeObject(s, cat, { model, id, yaw, scale, tags: [...tags, a.id], ...meta }, { at: pos.map(r2) }); s.objects.push(o); made.push(o.id); };
    const walls = {
      n: { L: w, yaw: 180, pos: (u) => [c[0] - w / 2 + u, c[1], c[2] - d / 2], lo: -T / 2, hi: w + T / 2 },
      s: { L: w, yaw: 0, pos: (u) => [c[0] - w / 2 + u, c[1], c[2] + d / 2], lo: -T / 2, hi: w + T / 2 },
      e: { L: d, yaw: 90, pos: (u) => [c[0] + w / 2, c[1], c[2] - d / 2 + u], lo: T / 2, hi: d - T / 2 },
      w: { L: d, yaw: 270, pos: (u) => [c[0] - w / 2, c[1], c[2] - d / 2 + u], lo: T / 2, hi: d - T / 2 },
    };
    const ops = (key, list, kind) => (list || []).filter((o) => o.wall === key).map((o) => {
      const wd = o.width ?? (kind === 'door' ? 1.0 : 1.2);
      return { u0: o.at - wd / 2, u1: o.at + wd / 2, kind, wd, y0: kind === 'door' ? 0 : 0.9, y1: 2.1 };
    });
    for (const [key, W] of Object.entries(walls)) {
      const list = [...ops(key, a.doors, 'door'), ...ops(key, a.windows, 'window')].sort((p, q) => p.u0 - q.u0);
      let cur = W.lo, k = 1;
      for (const op of list) {
        if (op.u0 < cur + 0.05 || op.u1 > W.hi - 0.05) throw new Fail('bad_opening', `Opening on wall ${key} at ${((op.u0 + op.u1) / 2).toFixed(2)} m does not fit. Walls ${key} runs 0 to ${W.L} m and openings must not touch each other or the corners.`);
        seg(cur, op.u0, 0, h, key, W, k++);
        if (op.y0 > 0) seg(op.u0, op.u1, 0, op.y0, key, W, k++);
        if (h > op.y1) seg(op.u0, op.u1, op.y1, h, key, W, k++);
        const fx = op.kind === 'door' ? 'door' : 'window', fw = fx === 'door' ? 1.05 : 1.2;
        push(fx, `${a.id}-${key}-${fx}-${k++}`, W.pos((op.u0 + op.u1) / 2).map((v, i) => (i === 1 ? v + op.y0 : v)), W.yaw, [op.wd / fw, 1, 1], ['wall']);
        cur = op.u1;
      }
      seg(cur, W.hi, 0, h, key, W, k++);
    }
    function seg(u0, u1, y0, y1, key, W, k) {
      const len = u1 - u0; if (len < 0.01 || y1 - y0 < 0.01) return;
      const m = len > 4 ? 'wall-5' : 'wall-3', base = m === 'wall-5' ? 5 : 3;
      const p = W.pos((u0 + u1) / 2); p[1] += y0;
      push(m, `${a.id}-${key}-wall-${k}`, p, W.yaw, [len / base, (y1 - y0) / 2.8, 1], ['wall']);
    }
    if (a.floor !== false) push('floor-tile', `${a.id}-floor`, [c[0], c[1], c[2]], 0, [w / 2, 1, d / 2], ['floor']);
    if (a.ceiling !== false) push('ceiling-tile', `${a.id}-ceiling`, [c[0], c[1] + h - 0.05, c[2]], 0, [w / 2, 1, d / 2], ['ceiling']);
    return { count: made.length, ids: made };
  }));

def('build_stairs', 'Place a flight of 14 steps. from is the foot of the stairs at the middle of the first step [x, y, z]. yaw is the climbing direction (0 climbs toward +z). Returns a path for move_along.',
  { id: str, from: vecXZ, yaw: num, height: { type: 'number', description: 'Total rise in metres. Default 2.38.' }, width: { type: 'number', description: 'Default 1.2 m.' }, source: common.source, estimated: common.estimated },
  ['from'],
  (scene, a, ctx) => mutate(scene, ctx, (s, cat) => {
    const m = modelOrFail(cat, 'stairs-14'), yaw = a.yaw ?? 0, hgt = a.height ?? m.size[1], wd = a.width ?? m.size[0];
    const f = at3(a.from), fw = rotYaw([0, 0, 1], yaw), len = m.size[2];
    const at = [f[0] + fw[0] * len / 2, f[1], f[2] + fw[2] * len / 2];
    const o = makeObject(s, cat, { model: 'stairs-14', id: a.id, yaw, scale: [wd / m.size[0], hgt / m.size[1], 1], tags: ['stairs'], source: a.source, estimated: a.estimated }, { at: at.map(r2) });
    s.objects.push(o);
    const top = [f[0] + fw[0] * len, f[1] + hgt, f[2] + fw[2] * len];
    return { id: o.id, bottom: f, top: top.map(r2), path: [f, top.map(r2)] };
  }));

def('place_sign', 'Place a sign model that shows text on its front.', { text: str, at: vecXZ, yaw: num, model: str, id: str, source: common.source, estimated: common.estimated, scale: placeProps.scale },
  ['text', 'at'],
  (scene, a, ctx) => mutate(scene, ctx, (s, cat) => {
    if (a.text.length > 60) throw new Fail('sign_text_too_long', 'Sign text must be 60 characters or fewer.');
    const o = makeObject(s, cat, { model: a.model || 'sign', id: a.id || uniqueId(s, 'sign'), at: a.at, yaw: a.yaw, scale: a.scale, label: a.text, tags: ['sign'], source: a.source, estimated: a.estimated });
    s.objects.push(o); return { id: o.id };
  }));

def('set_pose', 'Set the pose of an object at time t. Without t (or t = 0) it sets the starting pose.', { id: str, t: num, pose: { type: 'string', enum: POSES } }, ['id', 'pose'],
  (scene, a, ctx) => mutate(scene, ctx, (s) => {
    const o = find(s, a.id);
    if (!a.t) { o.pose = a.pose; if (trackOf(s, o.id, 'pose')) mergeKeys(s, o.id, 'pose', [{ t: 0, v: a.pose, ease: 'step' }]); return { id: o.id, t: 0, pose: a.pose }; }
    if (!trackOf(s, o.id, 'pose')) mergeKeys(s, o.id, 'pose', [{ t: 0, v: o.pose || 'stand', ease: 'step' }]);
    mergeKeys(s, o.id, 'pose', [{ t: a.t, v: a.pose, ease: 'step' }]);
    return { id: o.id, t: a.t, pose: a.pose };
  }));

const keySchema = { type: 'object', required: ['t', 'v'], properties: { t: num, v: { description: 'Value: [x,y,z] for at, a number for yaw, number or [x,y,z] for scale, a pose name for pose.' }, ease: { type: 'string', enum: EASES } } };
def('animate', 'Write a whole animation track (replaces the track). Keys need strictly rising t.', { id: str, channel: { type: 'string', enum: CHANNELS }, keys: { type: 'array', items: keySchema, minItems: 1 } }, ['id', 'channel', 'keys'],
  (scene, a, ctx) => mutate(scene, ctx, (s) => {
    find(s, a.id);
    s.tracks = s.tracks.filter((t) => !(t.object === a.id && t.channel === a.channel));
    s.tracks.push({ object: a.id, channel: a.channel, keys: a.keys.map((k) => ({ t: k.t, v: a.channel === 'at' && k.v.length === 2 ? at3(k.v) : k.v, ease: k.ease || (a.channel === 'pose' ? 'step' : 'linear') })) });
    return { id: a.id, channel: a.channel, keys: a.keys.length };
  }));

def('move_along', 'Move an object along a path of points. Writes at, yaw and pose tracks. Use speed (m/s) or times (one absolute time per point). It uses the walk pose (run above 3 m/s) while it moves and stand at the end.',
  { id: str, path: { type: 'array', items: { type: 'array', items: num, minItems: 2, maxItems: 3 }, minItems: 2 }, speed: num, times: { type: 'array', items: num }, start: num, pose: { type: 'string', enum: POSES }, end_pose: { type: 'string', enum: POSES } },
  ['id', 'path'],
  (scene, a, ctx) => mutate(scene, ctx, (s) => {
    const o = find(s, a.id), start = a.start ?? 0;
    const y0 = o.at[1];
    const P = a.path.map((p) => at3(p, y0));
    let times;
    if (a.times) {
      if (a.times.length !== P.length) throw new Fail('bad_args', 'times needs one value per path point.');
      times = a.times;
    } else {
      const sp = a.speed ?? 1.4; times = [start];
      for (let i = 1; i < P.length; i++) times.push(r2(times[i - 1] + Math.max(Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1], P[i][2] - P[i - 1][2]) / sp, 0.05)));
    }
    for (let i = 1; i < times.length; i++) if (times[i] <= times[i - 1]) throw new Fail('time_backwards', `times must rise: ${times[i]} is not after ${times[i - 1]}.`);
    const t0 = times[0], tEnd = times[times.length - 1];
    const speed = (a.speed ?? Math.hypot(P[1][0] - P[0][0], P[1][2] - P[0][2]) / (times[1] - times[0]));
    const moving = a.pose || (speed > 3 ? 'run' : 'walk');
    mergeKeys(s, o.id, 'at', P.map((p, i) => ({ t: times[i], v: p.map(r2), ease: 'linear' })), true);
    // yaw: face the direction of travel, turning over 0.24 s at corners
    const yk = []; let yaw = o.yaw ?? 0;
    const segYaw = (i) => Math.atan2(P[i + 1][0] - P[i][0], P[i + 1][2] - P[i][2]) / D;
    const first = trackOf(s, o.id, 'yaw')?.keys.filter((k) => k.t < t0).pop();
    yaw = wrapYaw(first ? first.v : yaw, segYaw(0));
    yk.push({ t: t0, v: r2(yaw), ease: 'linear' });
    for (let i = 1; i < P.length - 1; i++) {
      const ny = wrapYaw(yaw, segYaw(i));
      if (Math.abs(ny - yaw) > 1) {
        const h = Math.min(0.12, (times[i] - times[i - 1]) / 3, (times[i + 1] - times[i]) / 3);
        yk.push({ t: r2(times[i] - h), v: r2(yaw), ease: 'linear' }, { t: r2(times[i] + h), v: r2(ny), ease: 'linear' });
        yaw = ny;
      }
    }
    mergeKeys(s, o.id, 'yaw', yk, true);
    if (o.model === 'person') {
      if (!trackOf(s, o.id, 'pose') && t0 > 0) mergeKeys(s, o.id, 'pose', [{ t: 0, v: o.pose || 'stand', ease: 'step' }]);
      mergeKeys(s, o.id, 'pose', [{ t: t0, v: moving, ease: 'step' }, { t: tEnd, v: a.end_pose || 'stand', ease: 'step' }], false);
    }
    if (!trackOf(s, o.id, 'at').keys.some((k) => k.t < t0)) o.at = P[0].map(r2);
    return { id: o.id, start: t0, end: tEnd, pose: o.model === 'person' ? moving : undefined };
  }));

def('set_camera', 'Add or replace a camera key at time t. Give frame (object ids, the tool computes eye and target) or eye and target. The camera moves between keys. Two keys with different shots may be 1.5 s apart at most, unless cut is true (hold the old shot, then cut).',
  { t: num, shot: { type: 'string', enum: SHOTS }, frame: strArr, eye: vec3, target: vec3, fov: num, ease: { type: 'string', enum: EASES },
    view: { type: 'number', description: 'Camera side in degrees: 0 looks north from the south side, 90 looks west from the east side.' }, elevation: num, margin: num, distance: num, cut: { type: 'boolean' } },
  ['t', 'shot'],
  (scene, a, ctx) => mutate(scene, ctx, (s, cat) => {
    let eye = a.eye, target = a.target, fov = a.fov ?? 50;
    if (a.frame?.length) { const f = frameCamera(s, cat, a.frame, a.shot, a.t, a); eye = f.eye; target = f.target; fov = f.fov; }
    if (!eye || !target) throw new Fail('bad_args', 'Give frame (object ids) or both eye and target.');
    const key = { t: a.t, shot: a.shot, eye: eye.map(r2), target: target.map(r2), fov, ease: a.ease || 'inout' };
    s.camera = s.camera.filter((k) => Math.abs(k.t - a.t) > 1e-9);
    const prev = [...s.camera].reverse().find((k) => k.t < a.t);
    if (a.cut && prev) prev.ease = 'step';
    s.camera.push(key); s.camera.sort((p, q) => p.t - q.t);
    return { t: key.t, shot: key.shot, eye: key.eye, target: key.target, fov };
  }));

def('set_lighting', 'Set the lighting look from time t (day, dusk, night, indoor).', { t: num, look: { type: 'string', enum: LOOKS } }, ['t', 'look'],
  (scene, a, ctx) => mutate(scene, ctx, (s) => {
    s.lighting = (s.lighting || []).filter((k) => k.t !== a.t); s.lighting.push({ t: a.t, look: a.look }); s.lighting.sort((p, q) => p.t - q.t); return { t: a.t, look: a.look };
  }));

def('add_caption', 'Add a caption (up to 280 characters, at least 0.06 s per character on screen, no overlap with other captions).', { start: num, end: num, text: str }, ['start', 'end', 'text'],
  (scene, a, ctx) => mutate(scene, ctx, (s) => { s.captions.push({ start: a.start, end: a.end, text: a.text }); return { index: s.captions.length - 1, chars: a.text.length }; }));

def('add_callout', 'Add a callout label tied to an object for a time range.', { start: num, end: num, text: str, object: str, source: common.source, estimated: common.estimated, measured: common.measured }, ['start', 'end', 'text'],
  (scene, a, ctx) => mutate(scene, ctx, (s) => {
    const c = { start: a.start, end: a.end, text: a.text }; for (const k of ['object', 'source', 'estimated', 'measured']) if (a[k] !== undefined) c[k] = a[k];
    s.callouts.push(c); return { index: s.callouts.length - 1 };
  }));

def('add_chapter', 'Add a chapter (a named time range). With caption it also adds the caption for the whole chapter. focus lists the objects the shot must show. source says where the chapter facts come from.',
  { start: num, end: num, title: str, clock: str, caption: str, focus: strArr, shot: { type: 'string', enum: SHOTS }, source: common.source, estimated: common.estimated, measured: common.measured, id: str },
  ['start', 'end', 'title'],
  (scene, a, ctx) => mutate(scene, ctx, (s) => {
    const id = a.id || `c${s.chapters.length + 1}`;
    const c = { id, start: a.start, end: a.end, title: a.title, clock: a.clock || '', caption: a.caption || '', focus: a.focus || [], shot: a.shot || '', source: a.source || '' };
    for (const k of ['estimated', 'measured']) if (a[k] !== undefined) c[k] = a[k];
    for (const f of c.focus) find(s, f);
    s.chapters.push(c);
    if (a.caption) s.captions.push({ start: a.start, end: a.end, text: a.caption });
    return { id };
  }));

def('set_backdrop', 'Set the ground and the map. ground is grass, street, floor, plain or map. Ground "map" with an origin shows OneMap tiles. origin is {lat, lon}. onemap is {zoom, style} for the tiles.',
  { ground: { type: 'string', enum: GROUNDS }, size: { type: 'array', items: num, minItems: 2, maxItems: 2 }, color: str,
    origin: { type: 'object', properties: { lat: num, lon: num }, required: ['lat', 'lon'] }, onemap: { type: 'object' }, source: str, estimated: { type: 'boolean' } }, [],
  (scene, a, ctx) => mutate(scene, ctx, (s) => {
    s.backdrop = { ...(s.backdrop || {}), ...(a.ground ? { ground: a.ground } : {}), ...(a.size ? { size: a.size } : {}), ...(a.color ? { color: a.color } : {}) };
    if (a.origin || a.onemap) {
      s.map = s.map || {};
      if (a.origin) s.map.origin = a.origin;
      if (a.onemap) s.map.onemap = a.onemap;
      if (a.source !== undefined) s.map.source = a.source;
      if (a.estimated !== undefined) s.map.estimated = a.estimated;
    }
    return { backdrop: s.backdrop };
  }));

def('import_osm', 'Import the OpenStreetMap building footprints inside bbox [south, west, north, east] in degrees (at most 0.01 degrees a side). The scene origin becomes the bbox centre when the scene has no origin. bearing (degrees) turns the map so that a street with that compass bearing runs along z. The scene shows the OpenStreetMap credit by itself. The tool writes the ODbL data file next to the scene.',
  { bbox: { type: 'array', items: num, minItems: 4, maxItems: 4 }, bearing: num }, ['bbox'],
  (scene, a, ctx) => mutate(scene, ctx, (s) => {
    const [so, w, n, e] = a.bbox;
    if (!(so < n && w < e && n - so <= 0.01 && e - w <= 0.01)) throw new Fail('bad_args', 'bbox is [south, west, north, east] with south < north, west < east and at most 0.01 degrees a side.');
    if (!ctx.overpass) throw new Fail('no_osm_data', 'No OpenStreetMap answer. Call import_osm through the MCP server or the command line.');
    s.map = s.map || {};
    s.map.origin = s.map.origin || { lat: Math.round((so + n) * 5e5) / 1e6, lon: Math.round((w + e) * 5e5) / 1e6 };
    const found = parseOverpass(ctx.overpass, s.map.origin);
    if (!found.length) throw new Fail('no_buildings', 'OpenStreetMap has no building footprints inside this bbox.');
    s.map.osm = toMapBlock(found, s.map.origin, a.bearing || 0);
    if (a.bearing) s.map.bearing = a.bearing; else delete s.map.bearing;
    if (ctx.odblPath) { writeOdbl(ctx.odblPath, found, s.map.origin, a.bearing || 0); s.map.osm.dataFile = basename(ctx.odblPath); }
    return { buildings: found.length, origin: s.map.origin, bearing: a.bearing || 0, dataFile: s.map.osm.dataFile };
  }));

def('set_cutaway', 'Hide ceilings and the walls between the camera and its target (indoor scenes).', { ceilings: { type: 'boolean' }, nearWalls: { type: 'boolean' } }, [],
  (scene, a, ctx) => mutate(scene, ctx, (s) => { s.cutaway = { ceilings: a.ceilings ?? true, nearWalls: a.nearWalls ?? true }; return s.cutaway; }));

def('add_credit', 'Add a credit line that the export draws (for example a data licence credit).', { text: str }, ['text'],
  (scene, a, ctx) => mutate(scene, ctx, (s) => { s.credits = s.credits || []; if (!s.credits.includes(a.text)) s.credits.push(a.text); return { credits: s.credits.length }; }));

def('validate', 'Check the whole scene. Returns every error with code, path and message. An empty list means valid.', {}, [],
  (scene, a, ctx) => { const errs = validate(scene, ctx.catalogue || loadCatalogue()); return okr({ valid: errs.length === 0, count: errs.length, errors: errs }); });

def('render_preview', 'Render a picture of the scene at time t so you can look at it. The daemon does the rendering.', { t: num }, ['t'],
  (scene, a) => okr({ stub: true, t: a.t, message: 'Not rendered here. The Toybox daemon renders the picture and replaces this answer.' }));

def('export_scene', 'Write the scene to a .toybox.json file (and the captions to a .srt file next to it). Without path it returns the scene.', { path: str }, [],
  (scene, a, ctx) => {
    const errs = validate(scene, ctx.catalogue || loadCatalogue());
    if (!a.path) return okr({ errors: errs.length, scene });
    let file = a.path;
    if (ctx.exportDir) {
      file = resolve(ctx.exportDir, a.path);
      const rel = relative(ctx.exportDir, file);
      if (!rel || rel.startsWith('..') || isAbsolute(rel) || !file.endsWith('.toybox.json')) throw new Fail('bad_path', `path must be a .toybox.json file inside ${ctx.exportDir}.`);
    }
    saveScene(file, scene);
    const srtPath = file.replace(/(\.toybox)?\.json$/, '') + '.srt';
    writeFileSync(srtPath, srt(scene));
    return okr({ path: file, srt: srtPath, errors: errs.length });
  });

const GUIDE_DIR = join(dirname(fileURLToPath(import.meta.url)), 'guide');
def('guide', 'Read a how-to guide. Start with "overview". Others: people, camera, indoor, map, explainer.', { name: str }, [],
  (scene, a) => {
    const names = readdirSync(GUIDE_DIR).filter((f) => f.endsWith('.txt')).map((f) => f.slice(0, -4));
    const name = a.name || 'overview';
    if (!names.includes(name)) throw new Fail('unknown_guide', `No guide "${name}". Guides: ${names.join(', ')}.`);
    return okr({ name, text: readFileSync(join(GUIDE_DIR, `${name}.txt`), 'utf8') });
  });

export const toolSpecs = tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));
export const commands = Object.fromEntries(tools.map((t) => [t.name, t.run]));
export function runTool(scene, name, args, ctx) {
  if (!commands[name]) return fail([{ code: 'unknown_tool', message: `Unknown tool "${name}". Tools: ${Object.keys(commands).join(', ')}.` }]);
  return commands[name](scene, args, ctx);
}
export const { list_models, new_scene, get_scene, place, place_near, place_group, transform, duplicate, remove, build_room, build_stairs, place_sign,
  set_pose, animate, move_along, set_camera, set_lighting, add_caption, add_callout, add_chapter, set_backdrop, import_osm, set_cutaway, add_credit, render_preview, export_scene, guide } = commands;
export const validate_scene = commands.validate;

export const READ_ONLY = new Set(['list_models', 'get_scene', 'validate', 'render_preview', 'guide', 'export_scene']);
