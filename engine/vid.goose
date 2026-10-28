// The vid utilities, in Goose: the motion words and the life of a character, the raised and
// lowered text of a label, and the times of the narration. Each function is pure.
// web/vid.js loads the WebAssembly of this file in the browser and in Node, and gives the
// numbers and texts in and out: put() adds a number to the input, out(i) reads the result.
// A text goes in and out as its UTF-16 code units, as in JavaScript.

import std;
import math;

var g_in: f64[>..] = [];
var g_out: f64[>..] = [];

export "clear" fn clear() { g_in.clear(); }
export "put" fn put(x: f64) { g_in.push(x); }
export "out" fn out(i: i32) -> f64 { g_out[i] }
export "out_len" fn out_len() -> i32 { g_out.len as i32 }

// JavaScript Math.round: the nearest integer, a half goes up.
fn jround(v: f64) -> f64 {
    let f = floor(v);
    if v - f >= 0.5 { f + 1.0 } else { f }
}
// JavaScript Math.max of two numbers.
fn jmax(a: f64, b: f64) -> f64 {
    if is_nan(a) || is_nan(b) { a + b } else if a > b { a } else { b }
}

// ---------------------------------------------------------------- motion
// The motion words of a scene (scene.motions) and the life of a character (a model with the tag
// "character"): breath, blinks and eyes that look around. Each function is pure in t. Motion that
// looks random comes from hash(). The viewer gives the result to the engine (obj_pose).
//
// A pose adds or multiplies: dx (to the side), z and up (height), tilt (degrees), ex and ez (eye
// move) and spin (radians) add. s (size), sx (width), sz (height), eye (eye height) and gaze (how
// much the eyes look around by themselves) multiply. Lengths are in body units: 1 unit is half the
// height of the model. A pose that a word does not change keeps 1 (multiply) or 0 (add).
struct Pose {
    s: f64, sx: f64, sz: f64, dx: f64, z: f64, up: f64, tilt: f64,
    eye: f64, gaze: f64, ex: f64, ez: f64, spin: f64,
}

let MOVES = "pop out hop squash blink squint look glance wave spin";

fn rest() -> Pose {
    Pose { s: 1.0, sx: 1.0, sz: 1.0, dx: 0.0, z: 0.0, up: 0.0, tilt: 0.0, eye: 1.0, gaze: 1.0, ex: 0.0, ez: 0.0, spin: 0.0 }
}

fn clamp01(u: f64) -> f64 { if u < 0.0 { 0.0 } else if u > 1.0 { 1.0 } else { u } }
fn ease(t: f64, t0: f64, t1: f64) -> f64 {   // 0 before t0, 1 after t1, smooth in and out
    let u = clamp01((t - t0) / (t1 - t0));
    u * u * (3.0 - 2.0 * u)
}
fn bump(t: f64, t0: f64, t1: f64) -> f64 {
    if t <= t0 || t >= t1 { 0.0 } else { pow(sin((PI * (t - t0)) / (t1 - t0)), 2.0) }
}
fn hold(t: f64, t0: f64, t1: f64, r: f64) -> f64 {   // go to 1 in r seconds, stay, go back to 0 at t1
    ease(t, t0, t0 + r) - ease(t, t1 - r, t1)
}
// A blink closes in 0.13 s, stays closed 0.06 s and opens in 0.21 s. A look turns on a spring that is almost critically damped.
fn shut(t: f64, t0: f64) -> f64 { ease(t, t0, t0 + 0.13) - ease(t, t0 + 0.19, t0 + 0.4) }
fn settle(u: f64) -> f64 {
    if u <= 0.0 { 0.0 } else { 1.0 - exp(-21.7 * u) * (cos(7.9 * u) + 2.75 * sin(7.9 * u)) }
}
fn stretch(p: Pose&, sz: f64) { p.sz = sz; p.sx = 1.0 / sqrt(sz); }   // keep the volume about the same

fn pop(t: f64, t0: f64) -> Pose {   // grow from nothing with a spring: overshoot, stretch, then settle. Then the eyes open.
    var p = rest();
    let u = t - t0;
    if u <= 0.0 { p.s = 0.0; p.z = -0.25; p.eye = 0.0; return p; }
    let e = exp(-u / 0.08);
    let s = 1.0 - e * cos(17.5 * u);
    p.s = s; p.z = -0.25 * jmax(0.0, 1.0 - s); p.eye = ease(t, t0 + 0.12, t0 + 0.3);
    stretch(p, 1.0 + 0.16 * exp(-u / 0.1) * sin(17.5 * u));
    p
}
fn out_(t: f64, t0: f64, d: f64) -> Pose {   // swell a little, then shrink to nothing
    var p = rest();
    let k = clamp01((t - t0) / d);
    p.s = if k >= 1.0 { 0.0 } else { (1.0 + 0.15 * sin(PI * k)) * (1.0 - pow(k, 3.0)) };
    p
}
fn arc(k: f64, k0: f64, k1: f64, hh: f64) -> f64 {
    if k > k0 && k < k1 { (4.0 * hh * (k - k0) * (k1 - k)) / pow(k1 - k0, 2.0) } else { 0.0 }
}
fn hop_z(tt: f64, t0: f64, h: f64, d: f64) -> f64 {
    let k = (tt - t0) / d;
    arc(k, 0.0, 1.0, h) + arc(k, 1.2, 1.6, 0.15 * h)
}
fn hop(t: f64, t0: f64, h: f64, d: f64) -> Pose {   // crouch, jump on an arc with wide eyes, land with a squash, bounce once more, settle
    var p = rest();
    p.up = hop_z(t, t0, h, d);
    p.ez = 0.4 * (hop_z(t - 0.06, t0, h, d) - hop_z(t, t0, h, d));   // the eyes follow a little late
    p.eye = 1.0 + 0.15 * bump(t, t0, t0 + d) - 0.4 * bump(t, t0 + d - 0.02, t0 + d + 0.2);
    stretch(p, 1.0 - 0.08 * bump(t, t0 - 0.16, t0 + 0.04) + 0.07 * bump(t, t0, t0 + 0.5 * d)
        - 0.12 * bump(t, t0 + d, t0 + 1.2 * d) - 0.05 * bump(t, t0 + 1.6 * d, t0 + 1.6 * d + 0.16));
    p
}
fn squash(t: f64, t0: f64) -> Pose {   // stretch up a little, press down with closed eyes, then spring back with an overshoot
    var p = rest();
    let press = bump(t, t0, t0 + 0.26);
    p.eye = 1.0 - 0.7 * press;
    stretch(p, 1.0 + 0.04 * bump(t, t0 - 0.22, t0) - 0.12 * press
        + 0.05 * bump(t, t0 + 0.2, t0 + 0.46) - 0.015 * bump(t, t0 + 0.42, t0 + 0.62));
    p
}
fn blink(t: f64, t0: f64) -> Pose { var p = rest(); p.eye = 1.0 - 0.92 * shut(t, t0); p }
fn squint(t: f64, t0: f64, d: f64) -> Pose {
    var p = rest();
    p.eye = 1.0 - 0.5 * hold(t, t0, t0 + d, 0.18);
    p.sz = 1.0 - 0.03 * hold(t, t0, t0 + d, 0.18);
    p
}
// ex and ez go from -1 to 1 (right and up). gaze stops the eyes from looking around by themselves.
fn look(t: f64, t0: f64, d: f64, ex: f64, ez: f64) -> Pose {   // look at one place for d seconds, with a blink at the turn
    var p = rest();
    let m = settle(t - t0) - settle(t - t0 - d);
    p.ex = 0.22 * ex * m; p.ez = 0.14 * ez * m;
    p.gaze = 1.0 - hold(t, t0 - 0.2, t0 + d + 0.3, 0.2);
    p.eye = 1.0 - 0.92 * shut(t, t0 - 0.05);
    p
}
fn glance(t: f64, t0: f64, d: f64) -> Pose {   // look to one side, then to the other side
    var p = rest();
    let k = clamp01((t - t0) / d);
    p.ex = 0.16 * sin(2.0 * PI * k) * sin(PI * k);
    p.gaze = 1.0 - sin(PI * k);
    p
}
fn wave(t: f64, t0: f64, d: f64, deg: f64) -> Pose {   // rock from side to side
    var p = rest();
    let k = clamp01((t - t0) / d);
    p.tilt = deg * sin(4.0 * PI * k) * sin(PI * k);
    p
}
fn spin(t: f64, t0: f64, d: f64) -> Pose {   // the face goes 1 time around the body
    var p = rest();
    p.spin = 2.0 * PI * ease(t, t0, t0 + d);
    p.gaze = 1.0 - bump(t, t0 - 0.2, t0 + d + 0.2);
    p
}

fn dflt(v: f64, dflt: f64) -> f64 { if is_nan(v) { dflt } else { v } }   // NaN is a value that the scene leaves out

// The pose of one motion entry: the index of its word in MOVES, t, d, h, x, y and deg.
fn move_pose(m: i64, t: f64, t0: f64, d: f64, h: f64, x: f64, y: f64, deg: f64) -> Pose {
    if m == 0 { return pop(t, t0); }
    if m == 1 { return out_(t, t0, dflt(d, 0.3)); }
    if m == 2 { return hop(t, t0, dflt(h, 0.5), dflt(d, 0.5)); }
    if m == 3 { return squash(t, t0); }
    if m == 4 { return blink(t, t0); }
    if m == 5 { return squint(t, t0, dflt(d, 1.0)); }
    if m == 6 { return look(t, t0, dflt(d, 1.0), dflt(x, 1.0), dflt(y, 0.0)); }
    if m == 7 { return glance(t, t0, dflt(d, 1.2)); }
    if m == 8 { return wave(t, t0, dflt(d, 1.6), dflt(deg, 12.0)); }
    if m == 9 { return spin(t, t0, dflt(d, 0.9)); }
    rest()
}

fn hash(seed: i32, i: i64) -> f64 {   // a fixed number from 0 to 1 for each pair of integers
    var h: u32 = ((seed as! u32) ^ ((i as! u32) * 0x9e3779b1)) * 0x85ebca77;
    h ^= h >> 13;
    h = h * 0xc2b2ae3d;
    (h ^ (h >> 16)) / 4294967296.0
}
fn hi(seed: i32, i: f64) -> f64 { hash(seed, i as! i64) }

struct Gz { x: f64, z: f64 }
fn gaze_to(seed: i32, j: f64) -> Gz {
    if hi(seed, 4.0 * j + 10.0) < 0.25 { Gz { x: 0.0, z: 0.0 } }
    else { Gz { x: 2.0 * hi(seed, 4.0 * j + 11.0) - 1.0, z: 1.5 * hi(seed, 4.0 * j + 12.0) - 0.5 } }
}
fn gaze(t: f64, seed: i32) -> Gz {   // where the eyes look: x and z from -1 to 1. A new place every 1 to 2.2 s.
    let len = 1.0 + 1.2 * hash(seed, 3);
    let k = floor(t / len);
    let m = settle(t - k * len - 0.45 * len * hi(seed, 4.0 * k + 13.0));
    let a = gaze_to(seed, k - 1.0);
    let b = gaze_to(seed, k);
    Gz { x: a.x + (b.x - a.x) * m, z: a.z + (b.z - a.z) * m }
}
fn lids(t: f64, seed: i32) -> f64 {   // a blink every 2.8 to 7.4 s (sometimes 2 blinks), and a squint now and then
    let len = 2.8 + 4.6 * hash(seed, 5);
    let k = floor(t / len);
    let t0 = k * len + 0.5 * len * hi(seed, 3.0 * k + 20.0);
    let twice = if hi(seed, 3.0 * k + 21.0) < 0.25 { shut(t, t0 + 0.45) } else { 0.0 };
    let sl = 4.5 + 3.0 * hash(seed, 6);
    let j = floor(t / sl);
    let s0 = j * sl + 0.4 * sl * hi(seed, 3.0 * j + 22.0);
    let narrow = if hi(seed, 3.0 * j + 23.0) < 0.6 { hold(t, s0, s0 + 1.1, 0.18) } else { 0.0 };
    (1.0 - 0.92 * jmax(shut(t, t0), twice)) * (1.0 - 0.45 * narrow)
}

// The words of MOVES, as text in out. Returns their number.
export "moves" fn moves() -> i32 {
    g_out.clear();
    var n: i32 = 1;
    for c in MOVES { g_out.push(c); if c == 32 { n += 1; } }
    n
}

// The seed of a character from its id (the text in the input).
export "seed_of" fn seed_of() -> i32 {
    var seed: u32 = 7;
    for c in g_in { seed = (seed ^ (c as! u32)) * 16777619; }
    seed as! i32
}

// The pose of an object at time t: its motions (7 numbers each in the input: move t d h x y deg),
// plus its own life when life is 1 (a character). out holds s sx sz dx z up tilt eye gaze ex ez spin.
export "pose" fn pose(t: f64, seed: i32, life: i32) {
    var p = rest();
    var i: i64 = 0;
    while i + 7 <= g_in.len {
        let q = move_pose(g_in[i] as! i64, t, g_in[i + 1], g_in[i + 2], g_in[i + 3], g_in[i + 4], g_in[i + 5], g_in[i + 6]);
        p.s = p.s * q.s; p.sx = p.sx * q.sx; p.sz = p.sz * q.sz;
        p.dx = p.dx + q.dx; p.z = p.z + q.z; p.up = p.up + q.up; p.tilt = p.tilt + q.tilt;
        p.eye = p.eye * q.eye; p.gaze = p.gaze * q.gaze;
        p.ex = p.ex + q.ex; p.ez = p.ez + q.ez; p.spin = p.spin + q.spin;
        i += 7;
    }
    if life == 1 {
        let breath = sin(2.0 * PI * (t / (2.4 + hash(seed, 1)) + hash(seed, 2)));
        let g = gaze(t, seed);
        p.ex += 0.22 * g.x * p.gaze;
        p.ez += 0.14 * g.z * p.gaze + 0.015 * breath;
        p.sz *= 1.0 + 0.015 * breath;
        p.sx *= 1.0 - 0.01 * breath;
        p.eye *= lids(t, seed);
    }
    g_out.clear();
    for v in [p.s, p.sx, p.sz, p.dx, p.z, p.up, p.tilt, p.eye, p.gaze, p.ex, p.ez, p.spin] { g_out.push(v); }
}

// ---------------------------------------------------------------- marks
// Small raised and lowered text in a label, a callout, a caption or a chapter title:
// ^{...} and _{...}. For example "m^{2}", "CO_{2}", "31^{st}". A ^ or _ without braces is plain text.

// The end (the index of "}") of a mark that starts at i, or -1.
fn mark_end(i: i64) -> i64 {
    if i + 1 >= g_in.len || (g_in[i] != 94.0 && g_in[i] != 95.0) || g_in[i + 1] != 123.0 { return -1; }
    for j in i + 2..g_in.len { if g_in[j] == 125.0 { return j; } }
    -1
}

// The parts of the text in the input: 3 numbers each in out, shift (1 raised, -1 lowered, 0 normal)
// and the start and end of the part text in the input.
export "marks" fn marks() {
    g_out.clear();
    var from: i64 = 0;
    var i: i64 = 0;
    while i < g_in.len {
        let e = mark_end(i);
        if e < 0 { i += 1; continue; }
        if i > from { g_out.push(0.0); g_out.push(from); g_out.push(i); }
        g_out.push(if g_in[i] == 94.0 { 1.0 } else { -1.0 }); g_out.push(i + 2); g_out.push(e);
        i = e + 1;
        from = i;
    }
    if g_in.len > from { g_out.push(0.0); g_out.push(from); g_out.push(g_in.len); }
}

// The Unicode character for c raised (shift 1) or lowered (-1), or 0.
fn small(c: f64, shift: f64) -> f64 {
    if c >= 48.0 && c <= 57.0 {
        if shift < 0.0 { return 8320.0 + c - 48.0; }
        if c == 49.0 { return 185.0; }
        if c == 50.0 { return 178.0; }
        if c == 51.0 { return 179.0; }
        return 8304.0 + c - 48.0;
    }
    let base = if shift > 0.0 { 8314.0 } else { 8330.0 };
    if c == 43.0 { return base; }         // +
    if c == 45.0 { return base + 1.0; }   // -
    if c == 61.0 { return base + 2.0; }   // =
    if c == 40.0 { return base + 3.0; }   // (
    if c == 41.0 { return base + 4.0; }   // )
    if shift > 0.0 && c == 110.0 { return 8319.0; }   // n
    if shift > 0.0 && c == 105.0 { return 8305.0; }   // i
    0.0
}
fn letter(c: f64) -> bool { (c >= 65.0 && c <= 90.0) || (c >= 97.0 && c <= 122.0) }

// The text in the input for a place that has no raised text (an .srt file, a length count), in out:
// Unicode characters when they exist for all of the part, the letters alone for a word ("31st"),
// else ^(...) or _(...).
export "plain" fn plain() {
    marks();
    var parts: f64[>..] = [];
    for v in g_out { parts.push(v); }
    g_out.clear();
    var k: i64 = 0;
    while k + 3 <= parts.len {
        let shift = parts[k];
        let a = parts[k + 1] as! i64;
        let b = parts[k + 2] as! i64;
        k += 3;
        if shift == 0.0 { for i in a..b { g_out.push(g_in[i]); } continue; }
        var all = true;
        var word = b > a;
        for i in a..b {
            if small(g_in[i], shift) == 0.0 { all = false; }
            if !letter(g_in[i]) { word = false; }
        }
        if all { for i in a..b { g_out.push(small(g_in[i], shift)); } continue; }
        if word { for i in a..b { g_out.push(g_in[i]); } continue; }
        g_out.push(if shift > 0.0 { 94.0 } else { 95.0 });
        g_out.push(40.0);
        for i in a..b { g_out.push(g_in[i]); }
        g_out.push(41.0);
    }
}

// ---------------------------------------------------------------- narration
// Narration: 1 sentence = 1 beat. The voice (core/voice.mjs) sets the length of each beat.

let LEAD: f64 = 0.5;        // seconds of silence before the first sentence
let GAP: f64 = 0.45;        // between sentences
let TAIL: f64 = 0.8;        // after the last sentence
let STAND_IN: f64 = 0.066;  // seconds for each character of a sentence that has no voice yet

export "lead" fn lead() -> f64 { LEAD }
export "gap" fn gap() -> f64 { GAP }
export "tail" fn tail() -> f64 { TAIL }
export "stand_in" fn stand_in() -> f64 { STAND_IN }

fn r3(v: f64) -> f64 { jround(v * 1000.0) / 1000.0 }

// The stand-in seconds of a sentence with n characters.
export "stand_in_seconds" fn stand_in_seconds(n: i32) -> f64 { r3(STAND_IN * n) }

// The beats: the input has seconds and pause of each sentence, out gets start and end of each
// sentence. Returns the length of the narration in seconds.
export "timeline" fn timeline() -> f64 {
    g_out.clear();
    var t = LEAD - GAP;
    var i: i64 = 0;
    while i + 2 <= g_in.len {
        let start = r3(t + GAP);
        let end = r3(t + GAP + g_in[i]);
        g_out.push(start); g_out.push(end);
        t = end + g_in[i + 1];
        i += 2;
    }
    if i == 0 { 0.0 } else { r3(t + TAIL) }
}

// The index of the first n code units of the input (a sentence) at which the rest of the input
// (a word) starts, or -1. As String.indexOf.
export "find" fn find(n: i32) -> i32 {
    let w = g_in.len - n;
    var k: i64 = 0;
    while k + w <= n {
        var same = true;
        for j in w { if g_in[k + j] != g_in[n + j] { same = false; break; } }
        if same { return k as i32; }
        k += 1;
    }
    -1
}

// The time of the word at index k of a sentence of n code units from start to end: the start of the
// sentence plus the part of its length that comes before the word, plus offset seconds.
export "cue_time" fn cue_time(start: f64, end: f64, k: i32, n: i32, offset: f64) -> f64 {
    r3(start + ((end - start) * k) / n + offset)
}
