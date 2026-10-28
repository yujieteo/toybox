// The motion words of a scene (scene.motions) and the life of a character (a model with the tag
// "character"): breath, blinks and eyes that look around. Each function is pure in t. Motion that
// looks random comes from hash(), not Math.random(). The viewer gives the result to the engine
// (obj_pose), and core/scene.mjs takes MOVES from here.
//
// A pose is a small object such as {up: 0.3} or {s: 0.5}. poseAt() adds or multiplies the poses:
// dx (to the side), z and up (height), tilt (degrees), ex and ez (eye move) and spin (radians) add.
// s (size), sx (width), sz (height), eye (eye height) and gaze (how much the eyes look around by
// themselves) multiply. Lengths are in body units: 1 unit is half the height of the model.

export const MOVES = ['pop', 'out', 'hop', 'squash', 'blink', 'squint', 'look', 'glance', 'wave', 'spin'];

const clamp = (u) => (u < 0 ? 0 : u > 1 ? 1 : u);
function ease(t, t0, t1) {   // 0 before t0, 1 after t1, smooth in and out
  const u = clamp((t - t0) / (t1 - t0));
  return u * u * (3 - 2 * u);
}
const bump = (t, t0, t1) => (t <= t0 || t >= t1 ? 0 : Math.sin((Math.PI * (t - t0)) / (t1 - t0)) ** 2);
const hold = (t, t0, t1, r) => ease(t, t0, t0 + r) - ease(t, t1 - r, t1);   // go to 1 in r seconds, stay, go back to 0 at t1
// A blink closes in 0.13 s, stays closed 0.06 s and opens in 0.21 s. A look turns on a spring that is almost critically damped.
const shut = (t, t0) => ease(t, t0, t0 + 0.13) - ease(t, t0 + 0.19, t0 + 0.4);
const settle = (u) => (u <= 0 ? 0 : 1 - Math.exp(-21.7 * u) * (Math.cos(7.9 * u) + 2.75 * Math.sin(7.9 * u)));
const stretch = (sz) => ({ sz, sx: 1 / Math.sqrt(sz) });   // keep the volume about the same

function pop(t, t0) {   // grow from nothing with a spring: overshoot, stretch, then settle. Then the eyes open.
  const u = t - t0;
  if (u <= 0) return { s: 0, z: -0.25, eye: 0 };
  const e = Math.exp(-u / 0.08), s = 1 - e * Math.cos(17.5 * u);
  return { s, z: -0.25 * Math.max(0, 1 - s), eye: ease(t, t0 + 0.12, t0 + 0.3), ...stretch(1 + 0.16 * Math.exp(-u / 0.1) * Math.sin(17.5 * u)) };
}
function out(t, t0, d = 0.3) {   // swell a little, then shrink to nothing
  const k = clamp((t - t0) / d);
  return { s: k >= 1 ? 0 : (1 + 0.15 * Math.sin(Math.PI * k)) * (1 - k ** 3) };
}
function hop(t, t0, h = 0.5, d = 0.5) {   // crouch, jump on an arc with wide eyes, land with a squash, bounce once more, settle
  const arc = (k, k0, k1, hh) => (k > k0 && k < k1 ? (4 * hh * (k - k0) * (k1 - k)) / (k1 - k0) ** 2 : 0);
  const z = (tt) => { const k = (tt - t0) / d; return arc(k, 0, 1, h) + arc(k, 1.2, 1.6, 0.15 * h); };
  return {
    up: z(t), ez: 0.4 * (z(t - 0.06) - z(t)),   // the eyes follow a little late
    eye: 1 + 0.15 * bump(t, t0, t0 + d) - 0.4 * bump(t, t0 + d - 0.02, t0 + d + 0.2),
    ...stretch(1 - 0.08 * bump(t, t0 - 0.16, t0 + 0.04) + 0.07 * bump(t, t0, t0 + 0.5 * d)
      - 0.12 * bump(t, t0 + d, t0 + 1.2 * d) - 0.05 * bump(t, t0 + 1.6 * d, t0 + 1.6 * d + 0.16)),
  };
}
function squash(t, t0) {   // stretch up a little, press down with closed eyes, then spring back with an overshoot
  const press = bump(t, t0, t0 + 0.26);
  return { eye: 1 - 0.7 * press, ...stretch(1 + 0.04 * bump(t, t0 - 0.22, t0) - 0.12 * press
    + 0.05 * bump(t, t0 + 0.2, t0 + 0.46) - 0.015 * bump(t, t0 + 0.42, t0 + 0.62)) };
}
const blink = (t, t0) => ({ eye: 1 - 0.92 * shut(t, t0) });
const squint = (t, t0, d = 1) => ({ eye: 1 - 0.5 * hold(t, t0, t0 + d, 0.18), sz: 1 - 0.03 * hold(t, t0, t0 + d, 0.18) });
// ex and ez go from -1 to 1 (right and up). gaze stops the eyes from looking around by themselves.
const look = (t, t0, d = 1, ex = 1, ez = 0) => {   // look at one place for d seconds, with a blink at the turn
  const m = settle(t - t0) - settle(t - t0 - d);
  return { ex: 0.22 * ex * m, ez: 0.14 * ez * m, gaze: 1 - hold(t, t0 - 0.2, t0 + d + 0.3, 0.2), eye: 1 - 0.92 * shut(t, t0 - 0.05) };
};
const glance = (t, t0, d = 1.2) => {   // look to one side, then to the other side
  const k = clamp((t - t0) / d);
  return { ex: 0.16 * Math.sin(2 * Math.PI * k) * Math.sin(Math.PI * k), gaze: 1 - Math.sin(Math.PI * k) };
};
const wave = (t, t0, d = 1.6, deg = 12) => {   // rock from side to side
  const k = clamp((t - t0) / d);
  return { tilt: deg * Math.sin(4 * Math.PI * k) * Math.sin(Math.PI * k) };
};
const spin = (t, t0, d = 0.9) =>   // the face goes 1 time around the body
  ({ spin: 2 * Math.PI * ease(t, t0, t0 + d), gaze: 1 - bump(t, t0 - 0.2, t0 + d + 0.2) });

// The pose of one motion entry { move, t, d, h, x, y, deg } at time t. d, h, x, y and deg are optional.
export function movePose(m, t) {
  switch (m.move) {
    case 'pop': return pop(t, m.t);
    case 'out': return out(t, m.t, m.d);
    case 'hop': return hop(t, m.t, m.h, m.d);
    case 'squash': return squash(t, m.t);
    case 'blink': return blink(t, m.t);
    case 'squint': return squint(t, m.t, m.d);
    case 'look': return look(t, m.t, m.d, m.x, m.y);
    case 'glance': return glance(t, m.t, m.d);
    case 'wave': return wave(t, m.t, m.d, m.deg);
    case 'spin': return spin(t, m.t, m.d);
    default: return {};
  }
}

function hash(seed, i) {   // a fixed number from 0 to 1 for each pair of integers
  let h = Math.imul(seed ^ Math.imul(i, 0x9e3779b1), 0x85ebca77);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae3d);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function seedOf(id) {
  let seed = 7;
  for (let i = 0; i < id.length; i++) seed = Math.imul(seed ^ id.charCodeAt(i), 16777619);
  return seed;
}
function gaze(t, seed) {   // where the eyes look: [x, z] from -1 to 1. A new place every 1 to 2.2 s.
  const len = 1 + 1.2 * hash(seed, 3), k = Math.floor(t / len);
  const to = (j) => (hash(seed, 4 * j + 10) < 0.25 ? [0, 0] : [2 * hash(seed, 4 * j + 11) - 1, 1.5 * hash(seed, 4 * j + 12) - 0.5]);
  const m = settle(t - k * len - 0.45 * len * hash(seed, 4 * k + 13)), a = to(k - 1), b = to(k);
  return [a[0] + (b[0] - a[0]) * m, a[1] + (b[1] - a[1]) * m];
}
function lids(t, seed) {   // a blink every 2.8 to 7.4 s (sometimes 2 blinks), and a squint now and then
  const len = 2.8 + 4.6 * hash(seed, 5), k = Math.floor(t / len), t0 = k * len + 0.5 * len * hash(seed, 3 * k + 20);
  const twice = hash(seed, 3 * k + 21) < 0.25 ? shut(t, t0 + 0.45) : 0;
  const sl = 4.5 + 3 * hash(seed, 6), j = Math.floor(t / sl), s0 = j * sl + 0.4 * sl * hash(seed, 3 * j + 22);
  const narrow = hash(seed, 3 * j + 23) < 0.6 ? hold(t, s0, s0 + 1.1, 0.18) : 0;
  return (1 - 0.92 * Math.max(shut(t, t0), twice)) * (1 - 0.45 * narrow);
}

const ADD = new Set(['dx', 'z', 'up', 'tilt', 'ex', 'ez', 'spin']);
// The pose of an object at time t: its motions, plus its own life when seed is a number (a character).
export function poseAt(motions, t, seed = null) {
  const p = { s: 1, sx: 1, sz: 1, dx: 0, z: 0, up: 0, tilt: 0, eye: 1, gaze: 1, ex: 0, ez: 0, spin: 0 };
  for (const m of motions) { const q = movePose(m, t); for (const k in q) p[k] = ADD.has(k) ? p[k] + q[k] : p[k] * q[k]; }
  if (seed !== null) {
    const breath = Math.sin(2 * Math.PI * (t / (2.4 + hash(seed, 1)) + hash(seed, 2))), [gx, gz] = gaze(t, seed);
    p.ex += 0.22 * gx * p.gaze;
    p.ez += 0.14 * gz * p.gaze + 0.015 * breath;
    p.sz *= 1 + 0.015 * breath;
    p.sx *= 1 - 0.01 * breath;
    p.eye *= lids(t, seed);
  }
  return p;
}
