// The vid utilities: the motion words, the raised and lowered text and the narration times.
// The code is Goose (engine/vid.goose), compiled to web/vid.wasm. This file only loads the
// WebAssembly, in the browser and in Node, and gives numbers and texts to it.

const url = new URL('./vid.wasm', import.meta.url);
const bytes = typeof process === 'object' && process.versions?.node
  ? (await import('node:fs')).readFileSync(url)
  : await (await fetch(url)).arrayBuffer();
const fail = () => { throw new Error('vid.wasm stopped'); };
const { instance } = await WebAssembly.instantiate(bytes, {
  env: { emscripten_notify_memory_growth() {} },
  wasi_snapshot_preview1: { proc_exit: fail, fd_close: () => 8, fd_write: () => 8, fd_seek: () => 8 },
});
const W = instance.exports;
W._initialize();
W.vid_init();

function put(text) { W.clear(); for (let i = 0; i < text.length; i++) W.put(text.charCodeAt(i)); }
const result = () => Array.from({ length: W.out_len() }, (_, i) => W.out(i));
const textOf = (units) => String.fromCharCode(...units);

// ---------------------------------------------------------------- motion
// A pose is an object such as {up: 0.3, s: 0.5, ...}. engine/vid.goose tells what each key does.
// core/scene.mjs takes MOVES from here, and the viewer gives poses to the engine (obj_pose).
W.moves();
export const MOVES = textOf(result()).split(' ');
const KEYS = ['s', 'sx', 'sz', 'dx', 'z', 'up', 'tilt', 'eye', 'gaze', 'ex', 'ez', 'spin'];
const num = (v) => (v === undefined ? NaN : Number(v));   // NaN: the scene leaves the value out

export function seedOf(id) { put(id); return W.seed_of(); }

// The pose of an object at time t: its motions { move, t, d, h, x, y, deg }, plus its own life when
// seed is a number (a character).
export function poseAt(motions, t, seed = null) {
  W.clear();
  for (const m of motions) for (const v of [MOVES.indexOf(m.move), num(m.t), num(m.d), num(m.h), num(m.x), num(m.y), num(m.deg)]) W.put(v);
  W.pose(t, seed ?? 0, seed === null ? 0 : 1);
  return Object.fromEntries(KEYS.map((k, i) => [k, W.out(i)]));
}

// ---------------------------------------------------------------- marks
// Small raised and lowered text: ^{...} and _{...}, for example "m^{2}", "CO_{2}", "31^{st}".

// The parts of a text: [{ text, shift }], shift 1 is raised, -1 is lowered, 0 is normal.
export function marks(text) {
  const s = String(text), r = (put(s), W.marks(), result()), parts = [];
  for (let k = 0; k < r.length; k += 3) parts.push({ text: s.slice(r[k + 1], r[k + 2]), shift: r[k] });
  return parts;
}
// The text for a place that has no raised text (an .srt file, a length count).
export function plain(text) { put(String(text)); W.plain(); return textOf(result()); }

// ---------------------------------------------------------------- narration times
export const LEAD = W.lead(), GAP = W.gap(), TAIL = W.tail(), STAND_IN = W.stand_in();

// The stand-in seconds of a text that has no voice yet.
export const standIn = (text) => W.stand_in_seconds(text.length);

// The start and end of each sentence { seconds, pause }: [[start, end], ...], and the length.
export function beats(narration) {
  W.clear();
  for (const n of narration) { W.put(n.seconds); W.put(n.pause || 0); }
  const length = W.timeline(), r = result();
  return { times: narration.map((_, i) => [r[2 * i], r[2 * i + 1]]), length };
}

// The index of word in text, or -1.
export function find(text, word) { put(text + word); return W.find(text.length); }

// The time of the word at index k of sentence n, plus offset seconds.
export const cueAt = (n, k, offset) => W.cue_time(n.start, n.end, k, n.text.length, offset);
