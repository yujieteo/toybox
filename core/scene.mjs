// Scene model: create, load, save, validate. Format: docs/scene-format.md
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { rotYaw, rectCorners, overlapRatio } from './geom.mjs';

export const POSES = ['stand', 'walk', 'run', 'wave', 'point', 'cheer', 'sit', 'bend'];
export const SHOTS = ['wide', 'medium', 'close', 'top', 'follow', 'orbit'];
export const LOOKS = ['day', 'dusk', 'night', 'indoor'];
export const GROUNDS = ['grass', 'street', 'floor', 'plain', 'map'];
export const CHANNELS = ['at', 'yaw', 'scale', 'pose'];
export const EASES = ['linear', 'inout', 'step'];
export const PERSON_SIZE = [0.5, 1.75, 0.35];
export const STRUCTURAL_TAGS = ['wall', 'floor', 'ceiling'];
export const MAX_CAPTION = 280;
export const MIN_SEC_PER_CHAR = 0.06;
export const MAX_SHOT_MOVE = 1.5;
export const ASPECT = 16 / 9;

const here = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_CATALOGUE = join(here, '..', 'assets', 'catalogue.json');
let catCache = null;
export function loadCatalogue(path = DEFAULT_CATALOGUE) {
  if (path === DEFAULT_CATALOGUE && catCache) return catCache;
  const cat = JSON.parse(readFileSync(path, 'utf8'));
  if (path === DEFAULT_CATALOGUE) catCache = cat;
  return cat;
}

export function newScene(opts = {}) {
  const ground = opts.ground || 'grass';
  const s = {
    toybox: 1,
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

export function loadScene(path) { return JSON.parse(readFileSync(path, 'utf8')); }
export function saveScene(path, scene) {
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(scene, null, 1) + '\n');
  renameSync(tmp, path);
}

// ---------- interpolation
const ease = (e, u) => (e === 'inout' ? u * u * (3 - 2 * u) : u);
function lerpV(a, b, u) { return Array.isArray(a) ? a.map((v, i) => v + (b[i] - v) * u) : a + (b - a) * u; }
export function valueAt(keys, t) {
  if (!keys?.length) return undefined;
  if (t <= keys[0].t) return keys[0].v;
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    if (t < b.t) {
      if (a.ease === 'step' || typeof a.v === 'string') return a.v;
      return lerpV(a.v, b.v, ease(a.ease, (t - a.t) / (b.t - a.t)));
    }
  }
  return keys[keys.length - 1].v;
}
export function trackOf(scene, id, channel) { return scene.tracks?.find((k) => k.object === id && k.channel === channel); }
export function stateAt(scene, o, t) {
  const g = (ch, d) => { const tr = t == null ? null : trackOf(scene, o.id, ch); return tr ? valueAt(tr.keys, t) : d; };
  let sc = g('scale', o.scale ?? [1, 1, 1]);
  if (typeof sc === 'number') sc = [sc, sc, sc];
  return { at: g('at', o.at ?? [0, 0, 0]), yaw: g('yaw', o.yaw ?? 0), scale: sc };
}

export function cameraAt(scene, t) {
  const ks = scene.camera;
  if (!ks?.length) return null;
  const pack = (k) => ({ eye: k.eye, target: k.target, fov: k.fov ?? 50 });
  if (t <= ks[0].t) return { ...pack(ks[0]), shot: ks[0].shot };
  for (let i = 0; i < ks.length - 1; i++) {
    const a = ks[i], b = ks[i + 1];
    if (t < b.t) {
      if (a.ease === 'step') return { ...pack(a), shot: a.shot };
      const u = ease(a.ease, (t - a.t) / (b.t - a.t));
      return { eye: lerpV(a.eye, b.eye, u), target: lerpV(a.target, b.target, u), fov: lerpV(a.fov ?? 50, b.fov ?? 50, u), shot: a.shot };
    }
  }
  const l = ks[ks.length - 1];
  return { ...pack(l), shot: l.shot };
}

// ---------- bounds
function modelSize(o, cat) {
  if (o.model === 'person') return PERSON_SIZE;
  return cat.models.find((m) => m.id === o.model)?.size ?? null;
}
export function objectBounds(scene, catalogue, t) {
  const cat = catalogue || loadCatalogue();
  const byId = new Map((scene.objects || []).map((o) => [o.id, o]));
  const world = (o, depth = 0) => {
    const st = stateAt(scene, o, t);
    const p = o.parent && depth < 8 ? byId.get(o.parent) : null;
    if (!p) return st;
    const ps = world(p, depth + 1);
    const l = rotYaw([st.at[0] * ps.scale[0], st.at[1] * ps.scale[1], st.at[2] * ps.scale[2]], ps.yaw);
    return { at: [ps.at[0] + l[0], ps.at[1] + l[1], ps.at[2] + l[2]], yaw: ps.yaw + st.yaw, scale: [st.scale[0] * ps.scale[0], st.scale[1] * ps.scale[1], st.scale[2] * ps.scale[2]] };
  };
  const out = {};
  for (const o of scene.objects || []) {
    const sz = modelSize(o, cat);
    if (!sz) continue;
    const st = world(o);
    const w = sz[0] * Math.abs(st.scale[0]), h = sz[1] * Math.abs(st.scale[1]), d = sz[2] * Math.abs(st.scale[2]);
    const corners = rectCorners(st.at[0], st.at[2], w, d, st.yaw);
    const xs = corners.map((c) => c[0]), zs = corners.map((c) => c[1]);
    out[o.id] = { min: [Math.min(...xs), st.at[1], Math.min(...zs)], max: [Math.max(...xs), st.at[1] + h, Math.max(...zs)], corners, at: st.at, yaw: st.yaw, size: [w, h, d] };
  }
  return out;
}

// ---------- camera projection (pinhole, 16:9, vertical fov in degrees)
export function project(cam, p, aspect = ASPECT) {
  const f = norm(sub(cam.target, cam.eye));
  const right = norm(cross(f, [0, 1, 0]));
  const up = cross(right, f);
  const v = sub(p, cam.eye);
  const z = dot(v, f);
  if (z <= 0.01) return null;
  const th = Math.tan((cam.fov * Math.PI) / 360);
  return { x: dot(v, right) / (z * th * aspect), y: dot(v, up) / (z * th), depth: z };
}
export const sub = (a, b) => a.map((v, i) => v - b[i]);
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const norm = (a) => { const l = Math.hypot(...a) || 1; return a.map((v) => v / l); };
export function boundsVisible(cam, b) {
  const pts = [];
  for (const y of [b.min[1], b.max[1]]) for (const c of b.corners) pts.push([c[0], y, c[1]]);
  pts.push([(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2]);
  return pts.some((p) => { const q = project(cam, p); return q && Math.abs(q.x) <= 1 && Math.abs(q.y) <= 1; });
}

// ---------- blocked views: rays from the camera eye to an object, tested against buildings,
// structures and vehicles (OpenStreetMap footprints and catalogue models).
export const VIEW_STEP = 0.25;      // seconds between samples
export const MAX_BLOCKED = 0.5;     // a focus object may be hidden for at most this long
export const MAX_COVER = 0.2;       // at most this part of the frame may be an occluder in front of the target
const OCCLUDER_KINDS = new Set(['building', 'structure', 'vehicle']);
function prism(id, poly, y0, y1) {
  const xs = poly.map((p) => p[0]), zs = poly.map((p) => p[1]);
  return { id, poly, y0, y1, box: [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)] };
}
export function occluders(scene, cat, bt, skip = new Set()) {
  const out = (scene.map?.osm?.buildings || []).map((b) => prism(`osm:${b.id}`, b.poly, 0, b.height || 9));
  const kinds = new Map(cat.models.map((m) => [m.id, m.kind]));
  const cut = scene.cutaway || {};
  for (const o of scene.objects) {
    const b = bt[o.id], tags = o.tags || [];
    if (!b || o.hidden || skip.has(o.id) || !OCCLUDER_KINDS.has(kinds.get(o.model)) || tags.includes('floor')) continue;
    if ((cut.nearWalls && tags.includes('wall')) || (cut.ceilings && tags.includes('ceiling'))) continue;
    if (b.size[0] < 0.05 || b.size[1] < 0.05 || b.size[2] < 0.05) continue; // scaled to nothing (swapped out)
    out.push(prism(o.id, b.corners, b.min[1], b.max[1]));
  }
  return out;
}
function inPoly([x, z], poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}
function segsCross(p, q, a, b) {
  const o = (u, v, w) => Math.sign((v[0] - u[0]) * (w[1] - u[1]) - (v[1] - u[1]) * (w[0] - u[0]));
  return o(p, q, a) !== o(p, q, b) && o(a, b, p) !== o(a, b, q);
}
// True when the segment a-b ([x, y, z]) passes through the prism.
export function segmentHits(a, b, o) {
  let s0 = 0, s1 = 1;
  const dy = b[1] - a[1];
  if (Math.abs(dy) < 1e-9) { if (a[1] < o.y0 || a[1] > o.y1) return false; }
  else {
    let u = (o.y0 - a[1]) / dy, w = (o.y1 - a[1]) / dy;
    if (u > w) [u, w] = [w, u];
    s0 = Math.max(s0, u); s1 = Math.min(s1, w);
    if (s0 >= s1) return false;
  }
  const P = [a[0] + (b[0] - a[0]) * s0, a[2] + (b[2] - a[2]) * s0], Q = [a[0] + (b[0] - a[0]) * s1, a[2] + (b[2] - a[2]) * s1];
  if (Math.max(P[0], Q[0]) < o.box[0] || Math.min(P[0], Q[0]) > o.box[2] || Math.max(P[1], Q[1]) < o.box[1] || Math.min(P[1], Q[1]) > o.box[3]) return false;
  if (inPoly(P, o.poly) || inPoly(Q, o.poly)) return true;
  for (let i = 0; i < o.poly.length; i++) if (segsCross(P, Q, o.poly[i], o.poly[(i + 1) % o.poly.length])) return true;
  return false;
}
// The occluder that hides object bounds b from the camera, or null. Six points of the object are tested
// (centre, top and four corners). Only points inside the frame count. The object is hidden when more
// than half of those points are behind an occluder.
export function blockerOf(cam, b, occ) {
  const c = b.corners.reduce((s, p) => [s[0] + p[0] / 4, s[1] + p[1] / 4], [0, 0]);
  const midY = (b.min[1] + b.max[1]) / 2;
  const pts = [[c[0], midY, c[1]], [c[0], b.min[1] + 0.9 * (b.max[1] - b.min[1]), c[1]],
    ...b.corners.map((p) => [p[0] * 0.7 + c[0] * 0.3, midY, p[1] * 0.7 + c[1] * 0.3])];
  let seen = 0, hidden = 0, by = null;
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
export function frameCover(cam, occ) {
  const f = norm(sub(cam.target, cam.eye)), r = norm(cross(f, [0, 1, 0])), u = cross(r, f);
  const th = Math.tan((cam.fov * Math.PI) / 360), depth = Math.hypot(...sub(cam.target, cam.eye));
  const count = new Map();
  let hidden = 0;
  for (let j = 0; j < 9; j++) for (let i = 0; i < 16; i++) {
    const x = (-1 + (i + 0.5) / 8) * th * ASPECT, y = (1 - (j + 0.5) / 4.5) * th;
    const p = [0, 1, 2].map((k) => cam.eye[k] + (f[k] + r[k] * x + u[k] * y) * depth);
    if (p[1] < 0 && cam.eye[1] > 0) { const s = cam.eye[1] / (cam.eye[1] - p[1]); for (let k = 0; k < 3; k++) p[k] = cam.eye[k] + (p[k] - cam.eye[k]) * s; }
    const hit = occ.find((o) => !inPoly([p[0], p[2]], o.poly) && segmentHits(cam.eye, p, o));
    if (hit) { hidden++; count.set(hit.id, (count.get(hit.id) || 0) + 1); }
  }
  return { part: hidden / 144, by: [...count].sort((a, b) => b[1] - a[1])[0]?.[0] || null };
}

// Every time span longer than MAX_BLOCKED in which an occluder hides a chapter focus object, or covers
// more than MAX_COVER of the frame in front of the camera target. Sampled every VIEW_STEP.
export function blockedViews(scene, catalogue) {
  const cat = catalogue || loadCatalogue();
  const errs = [];
  (scene.chapters || []).forEach((c, i) => {
    const focus = (c.focus || []).filter((f) => scene.objects.some((o) => o.id === f && !o.hidden));
    if (!(c.end > c.start)) return;
    const FRAME = '\u0000frame', runs = new Map([...focus, FRAME].map((f) => [f, null]));
    const close = (f, t) => {
      const r = runs.get(f);
      if (r && t - r.t0 > MAX_BLOCKED + 1e-9) errs.push({ code: 'view_blocked', path: `chapters[${i}]`,
        message: `Chapter ${c.id}: ${r.by} ${f === FRAME ? `covers more than ${MAX_COVER * 100} percent of the frame in front of the camera target` : `hides focus object ${f}`} from ${r.t0.toFixed(2)} s to ${t.toFixed(2)} s. Move the camera (another view angle, a higher elevation, or a shot along the street) so nothing stands between the camera and the subject.` });
      runs.set(f, null);
    };
    const mark = (f, by, t) => { if (by && !runs.get(f)) runs.set(f, { t0: t, by }); else if (!by) close(f, t); };
    const n = Math.max(1, Math.round((c.end - c.start) / VIEW_STEP));
    for (let k = 0; k <= n; k++) {
      const t = Math.min(c.end, c.start + k * VIEW_STEP), cam = cameraAt(scene, t);
      if (!cam) return;
      const bt = objectBounds(scene, cat, t), occ = occluders(scene, cat, bt, new Set(focus));
      for (const f of focus) mark(f, bt[f] && Math.min(...bt[f].size) >= 0.05 && blockerOf(cam, bt[f], occ), t);
      const cover = frameCover(cam, occ);
      mark(FRAME, cover.part > MAX_COVER && cover.by, t);
    }
    for (const f of runs.keys()) close(f, c.end);
  });
  return errs;
}

// ---------- contrast
function lum(hex) {
  const h = hex.replace('#', '');
  const f = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrastRatio(a, b) { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); }
export function contrast_ok(a, b) { return contrastRatio(a, b) >= 4.5; }

// ---------- SRT
function ts(sec) {
  const ms = Math.round(sec * 1000);
  const p = (n, w) => String(n).padStart(w, '0');
  return `${p(Math.floor(ms / 3600000), 2)}:${p(Math.floor(ms / 60000) % 60, 2)}:${p(Math.floor(ms / 1000) % 60, 2)},${p(ms % 1000, 3)}`;
}
export function srt(scene) {
  return [...(scene.captions || [])].sort((a, b) => a.start - b.start)
    .map((c, i) => `${i + 1}\n${ts(c.start)} --> ${ts(c.end)}\n${c.text}\n`).join('\n');
}

// ---------- validation
export const HARD_CODES = new Set(['schema', 'unknown_model', 'below_ground', 'overlap', 'time_backwards', 'caption_too_long', 'caption_too_short_on_screen',
  'caption_overlap', 'shot_move_too_long', 'measured_no_source', 'estimate_not_flagged', 'duplicate_id', 'unknown_object']);

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isVec = (v, n = 3) => Array.isArray(v) && v.length === n && v.every(isNum);
const isHex = (v) => typeof v === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v);

export function validate(scene, catalogue) {
  const cat = catalogue || loadCatalogue();
  const errs = [];
  const E = (code, path, message) => errs.push({ code, path, message });
  if (!scene || typeof scene !== 'object') { E('schema', '', 'Scene is not an object.'); return errs; }
  if (scene.toybox !== 1) E('schema', 'toybox', 'toybox must be 1.');
  for (const k of ['objects', 'tracks', 'camera', 'chapters', 'captions', 'callouts']) {
    if (!Array.isArray(scene[k])) { E('schema', k, `${k} must be an array.`); scene = { ...scene, [k]: [] }; }
  }
  if (!isNum(scene.duration) || scene.duration < 0) E('schema', 'duration', 'duration must be a number of seconds.');
  if (scene.backdrop && !GROUNDS.includes(scene.backdrop.ground)) E('schema', 'backdrop.ground', `ground must be one of ${GROUNDS.join(', ')}.`);
  if (scene.backdrop?.ground === 'map' && scene.map?.bearing) E('schema', 'map.bearing', 'OneMap tiles cannot turn. Use a ground other than "map" when the map has a bearing.');
  if (scene.lighting !== undefined && !Array.isArray(scene.lighting)) E('schema', 'lighting', 'lighting must be an array.');
  const models = new Map(cat.models.map((m) => [m.id, m]));
  const ids = new Set();
  let maxT = 0;
  const seeT = (t) => { if (isNum(t) && t > maxT) maxT = t; };

  scene.objects.forEach((o, i) => {
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
    if (o.pose !== undefined && !POSES.includes(o.pose)) E('schema', `${p}.pose`, `pose must be one of ${POSES.join(', ')}.`);
    if (o.tags !== undefined && !Array.isArray(o.tags)) E('schema', `${p}.tags`, 'tags must be an array.');
    if (o.parent && !scene.objects.some((q) => q.id === o.parent)) E('unknown_object', `${p}.parent`, `Parent ${o.parent} does not exist.`);
    if (o.measured === true && !o.source) E('measured_no_source', p, `Object ${o.id} is measured but has no source.`);
    if (typeof o.source === 'string' && /^estimated/i.test(o.source) && o.estimated !== true) E('estimate_not_flagged', p, `Object ${o.id} has an estimated source but estimated is not true.`);
  });

  // tracks
  scene.tracks.forEach((tr, i) => {
    const p = `tracks[${i}]`;
    if (!ids.has(tr.object)) E('unknown_object', `${p}.object`, `Track object ${tr.object} does not exist.`);
    if (!CHANNELS.includes(tr.channel)) E('schema', `${p}.channel`, `channel must be one of ${CHANNELS.join(', ')}.`);
    if (!Array.isArray(tr.keys) || !tr.keys.length) { E('schema', `${p}.keys`, 'keys must be a non-empty array.'); return; }
    tr.keys.forEach((k, j) => {
      const kp = `${p}.keys[${j}]`;
      if (!isNum(k.t) || k.t < 0) E('schema', `${kp}.t`, 't must be a number of seconds >= 0.');
      else seeT(k.t);
      if (k.ease !== undefined && !EASES.includes(k.ease)) E('schema', `${kp}.ease`, `ease must be one of ${EASES.join(', ')}.`);
      const ok = tr.channel === 'at' ? isVec(k.v) : tr.channel === 'yaw' ? isNum(k.v) : tr.channel === 'scale' ? (isNum(k.v) || isVec(k.v)) : POSES.includes(k.v);
      if (!ok) E('schema', `${kp}.v`, `Bad value for channel ${tr.channel}.`);
      if (j > 0 && isNum(k.t) && k.t <= tr.keys[j - 1].t) E('time_backwards', kp, `Key time ${k.t} is not after ${tr.keys[j - 1].t}.`);
    });
  });

  // camera
  scene.camera.forEach((k, i) => {
    const p = `camera[${i}]`;
    if (!isNum(k.t) || k.t < 0) E('schema', `${p}.t`, 't must be a number of seconds >= 0.'); else seeT(k.t);
    if (!SHOTS.includes(k.shot)) E('schema', `${p}.shot`, `shot must be one of ${SHOTS.join(', ')}.`);
    if (!isVec(k.eye)) E('schema', `${p}.eye`, 'eye must be [x, y, z].');
    if (!isVec(k.target)) E('schema', `${p}.target`, 'target must be [x, y, z].');
    if (k.fov !== undefined && (!isNum(k.fov) || k.fov < 10 || k.fov > 120)) E('schema', `${p}.fov`, 'fov must be 10 to 120 degrees.');
    if (i > 0 && isNum(k.t) && k.t <= scene.camera[i - 1].t) E('time_backwards', p, `Camera key time ${k.t} is not after ${scene.camera[i - 1].t}.`);
    if (i > 0 && isNum(k.t) && k.shot !== scene.camera[i - 1].shot && scene.camera[i - 1].ease !== 'step' && k.t - scene.camera[i - 1].t > MAX_SHOT_MOVE + 1e-9)
      E('shot_move_too_long', p, `Camera moves from ${scene.camera[i - 1].shot} to ${k.shot} over ${(k.t - scene.camera[i - 1].t).toFixed(2)} s. Use at most ${MAX_SHOT_MOVE} s, or cut (ease "step" on the earlier key).`);
  });

  // lighting
  (Array.isArray(scene.lighting) ? scene.lighting : []).forEach((l, i) => {
    if (!LOOKS.includes(l.look)) E('schema', `lighting[${i}].look`, `look must be one of ${LOOKS.join(', ')}.`);
    if (!isNum(l.t)) E('schema', `lighting[${i}].t`, 't must be a number.'); else seeT(l.t);
    if (i > 0 && isNum(l.t) && l.t <= scene.lighting[i - 1].t) E('time_backwards', `lighting[${i}]`, 'Lighting times must increase.');
  });

  // chapters, captions, callouts
  let prevEnd = -Infinity;
  const capsSorted = [...scene.captions].sort((a, b) => a.start - b.start);
  scene.chapters.forEach((c, i) => {
    const p = `chapters[${i}]`;
    if (!isNum(c.start) || !isNum(c.end)) { E('schema', p, 'Chapter needs numeric start and end.'); return; }
    seeT(c.end);
    if (c.end <= c.start) E('time_backwards', p, `Chapter ends (${c.end}) before it starts (${c.start}).`);
    if (c.start < prevEnd - 1e-9) E('time_backwards', p, `Chapter starts at ${c.start}, before the previous chapter ends at ${prevEnd}.`);
    prevEnd = c.end;
    if (c.shot !== undefined && !SHOTS.includes(c.shot)) E('schema', `${p}.shot`, `shot must be one of ${SHOTS.join(', ')}.`);
    const hasCap = (typeof c.caption === 'string' && c.caption.trim()) || scene.captions.some((x) => x.start < c.end && x.end > c.start);
    if (!hasCap) E('chapter_no_caption', p, `Chapter ${c.id} has no caption.`);
    if (c.measured === true && !c.source) E('measured_no_source', p, `Chapter ${c.id} is measured but has no source.`);
    if (typeof c.source === 'string' && /^estimated/i.test(c.source) && c.estimated !== true) E('estimate_not_flagged', p, `Chapter ${c.id} has an estimated source but estimated is not true.`);
    for (const f of c.focus || []) if (!ids.has(f)) E('unknown_object', `${p}.focus`, `Focus object ${f} does not exist.`);
  });
  scene.captions.forEach((c, i) => {
    const p = `captions[${i}]`;
    if (!isNum(c.start) || !isNum(c.end) || typeof c.text !== 'string') { E('schema', p, 'Caption needs start, end and text.'); return; }
    seeT(c.end);
    if (c.end <= c.start) E('time_backwards', p, `Caption ends (${c.end}) before it starts (${c.start}).`);
    if (c.text.length > MAX_CAPTION) E('caption_too_long', p, `Caption has ${c.text.length} characters. The limit is ${MAX_CAPTION}.`);
    const need = c.text.length * MIN_SEC_PER_CHAR;
    if (c.end - c.start + 1e-9 < need) E('caption_too_short_on_screen', p, `Caption shows for ${(c.end - c.start).toFixed(2)} s but needs ${need.toFixed(2)} s (${MIN_SEC_PER_CHAR} s per character).`);
  });
  for (let i = 1; i < capsSorted.length; i++) {
    if (capsSorted[i].start < capsSorted[i - 1].end - 1e-9) E('caption_overlap', `captions[${scene.captions.indexOf(capsSorted[i])}]`, 'Captions overlap in time.');
  }
  scene.callouts.forEach((c, i) => {
    const p = `callouts[${i}]`;
    if (!isNum(c.start) || !isNum(c.end)) { E('schema', p, 'Callout needs start and end.'); return; }
    seeT(c.end);
    if (c.end <= c.start) E('time_backwards', p, 'Callout ends before it starts.');
    if (c.object && !ids.has(c.object)) E('unknown_object', `${p}.object`, `Callout object ${c.object} does not exist.`);
    if (c.measured === true && !c.source) E('measured_no_source', p, 'Callout is measured but has no source.');
    if (typeof c.source === 'string' && /^estimated/i.test(c.source) && c.estimated !== true) E('estimate_not_flagged', p, 'Callout has an estimated source but estimated is not true.');
  });
  if (isNum(scene.duration) && scene.duration + 1e-9 < maxT) E('duration_too_short', 'duration', `duration is ${scene.duration} s but the last time in the scene is ${maxT} s.`);

  if (scene.chapters.length >= 12) {
    const shots = new Set([...scene.chapters.map((c) => c.shot), ...scene.camera.map((k) => k.shot)].filter(Boolean));
    if (shots.size < 3) E('too_few_shot_types', 'camera', `A scene with ${scene.chapters.length} chapters needs at least 3 shot types. It has ${shots.size}.`);
  }

  // geometry checks need valid models
  const bounds = objectBounds(scene, cat, 0);
  scene.objects.forEach((o, i) => {
    const b = bounds[o.id];
    if (b && b.min[1] < -0.01) E('below_ground', `objects[${i}]`, `Object ${o.id} reaches y=${b.min[1].toFixed(2)} m, below the ground.`);
  });
  const movers = new Set(scene.tracks.filter((t) => t.channel === 'at' || t.channel === 'scale').map((t) => t.object));
  const cand = scene.objects.filter((o) => bounds[o.id] && !o.hidden && !o.parent && !movers.has(o.id)
    && !(o.tags || []).some((t) => STRUCTURAL_TAGS.includes(t)) && models.get(o.model)?.kind !== 'road' && o.pose !== 'sit');
  for (let a = 0; a < cand.length; a++) for (let b = a + 1; b < cand.length; b++) {
    const A = cand[a], B = cand[b];
    if (A.model === 'person' && B.model === 'person') continue;
    const ba = bounds[A.id], bb = bounds[B.id];
    if (ba.min[0] >= bb.max[0] || bb.min[0] >= ba.max[0] || ba.min[2] >= bb.max[2] || bb.min[2] >= ba.max[2]) continue;
    if (ba.min[1] >= bb.max[1] || bb.min[1] >= ba.max[1]) continue; // stacked in height, no overlap
    const ratio = overlapRatio(ba.corners, bb.corners);
    if (ratio > 0.2) E('overlap', `objects[${scene.objects.indexOf(B)}]`, `Objects ${A.id} and ${B.id} overlap by ${(ratio * 100).toFixed(0)} percent of the smaller footprint.`);
  }
  // focus visibility at chapter start
  scene.chapters.forEach((c, i) => {
    if (!c.focus?.length || !isNum(c.start)) return;
    const cam = cameraAt(scene, c.start);
    if (!cam) return;
    const bt = objectBounds(scene, cat, c.start);
    for (const f of c.focus) {
      const o = scene.objects.find((x) => x.id === f);
      if (!o) continue;
      if (o.hidden) { E('focus_out_of_view', `chapters[${i}].focus`, `Focus object ${f} is hidden.`); continue; }
      if (bt[f] && !boundsVisible(cam, bt[f])) E('focus_out_of_view', `chapters[${i}].focus`, `Focus object ${f} is outside the camera view at ${c.start} s.`);
    }
  });
  return errs;
}

// Colours the export uses for caption text and its plate. The eval checks their contrast.
export const CAPTION_STYLE = { fg: '#ffffff', bg: '#22272f' };
