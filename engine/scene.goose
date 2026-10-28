// Toybox engine: the scene, the timeline sampler, the camera and the draw calls, in Goose.
// A C shim (gl_shim.h) owns the WebGL2 calls. render_frame(t) is deterministic in t.
// The JavaScript layer reads the scene file and feeds this program through the exported functions.

import std;
import math;

struct Mat { m: f32[16] }
struct V { x: f32, y: f32, z: f32, nx: f32, ny: f32, nz: f32 }

struct Obj {
    prim: i32, mesh: i32, parent: i32, flags: i32, variant: i32, pose: i32, flip: i32,
    x: f32, y: f32, z: f32, yaw: f32, rx: f32, ry: f32, rz: f32,
    sx: f32, sy: f32, sz: f32,
    r: f32, g: f32, b: f32, r2: f32, g2: f32, b2: f32, shadow: f32,
}

struct Trk { obj: i32, ch: i32, first: i32, n: i32 }

extern fn gl_init(w: i32, h: i32);
extern fn gl_resize(w: i32, h: i32);
extern fn gl_mesh(id: i32, data: f32[:]);
extern fn gl_begin(r: f32, g: f32, b: f32);
extern fn gl_light(dx: f32, dy: f32, dz: f32, lr: f32, lg: f32, lb: f32);
extern fn gl_front(flip: i32);
extern fn gl_draw(mesh: i32, mvp: Mat&, model: Mat&, r: f32, g: f32, b: f32, a: f32, outline: i32);
extern fn gl_draw_skin(lod: i32, mvp: Mat&, model: Mat&, bones: f32[:], pal: f32[:], outline: i32);
extern fn gl_draw_ground(mvp: Mat&);

let PI32: f32 = 3.14159265;
let DEG: f32 = 0.0174533;
let FLAG_HIDDEN: i32 = 1;
let FLAG_CEIL: i32 = 2;
let FLAG_WALL: i32 = 4;

// ---------------------------------------------------------------- matrices
fn ident() -> Mat {
    var r = Mat { m: [1.0, 0.0, 0.0, 0.0,  0.0, 1.0, 0.0, 0.0,  0.0, 0.0, 1.0, 0.0,  0.0, 0.0, 0.0, 1.0] };
    r
}

// Column-major: element (row, col) is m[col * 4 + row].
fn mul(a: Mat, b: Mat) -> Mat {
    var r = ident();
    for c in 4 {
        for rw in 4 {
            var s: f32 = 0.0;
            for k in 4 { s += a.m[k * 4 + rw] * b.m[c * 4 + k]; }
            r.m[c * 4 + rw] = s;
        }
    }
    r
}

fn translate(x: f32, y: f32, z: f32) -> Mat {
    var r = ident();
    r.m[12] = x; r.m[13] = y; r.m[14] = z;
    r
}

fn scale(x: f32, y: f32, z: f32) -> Mat {
    var r = ident();
    r.m[0] = x; r.m[5] = y; r.m[10] = z;
    r
}

fn rot_x(a: f32) -> Mat {
    var r = ident();
    let c = cos(a); let s = sin(a);
    r.m[5] = c; r.m[6] = s; r.m[9] = 0.0 - s; r.m[10] = c;
    r
}

fn rot_y(a: f32) -> Mat {
    var r = ident();
    let c = cos(a); let s = sin(a);
    r.m[0] = c; r.m[2] = 0.0 - s; r.m[8] = s; r.m[10] = c;
    r
}

fn rot_z(a: f32) -> Mat {
    var r = ident();
    let c = cos(a); let s = sin(a);
    r.m[0] = c; r.m[1] = s; r.m[4] = 0.0 - s; r.m[5] = c;
    r
}

fn perspective(fovy: f32, aspect: f32, n: f32, f: f32) -> Mat {
    var r = ident();
    let t = 1.0 / tan(fovy * 0.5);
    r.m[0] = t / aspect; r.m[5] = t;
    r.m[10] = (f + n) / (n - f); r.m[11] = -1.0;
    r.m[14] = (2.0 * f * n) / (n - f); r.m[15] = 0.0;
    r
}

fn look_at(ex: f32, ey: f32, ez: f32, tx: f32, ty: f32, tz: f32) -> Mat {
    var fx = tx - ex; var fy = ty - ey; var fz = tz - ez;
    let fl = sqrt(fx * fx + fy * fy + fz * fz);
    fx /= fl; fy /= fl; fz /= fl;
    var sx = 0.0 - fz; var sy: f32 = 0.0; var sz = fx;
    var sl = sqrt(sx * sx + sz * sz);
    if sl < 0.0001 { sx = 1.0; sz = 0.0; sl = 1.0; }
    sx /= sl; sz /= sl;
    let ux = sy * fz - sz * fy;
    let uy = sz * fx - sx * fz;
    let uz = sx * fy - sy * fx;
    var r = ident();
    r.m[0] = sx; r.m[4] = sy; r.m[8] = sz;
    r.m[1] = ux; r.m[5] = uy; r.m[9] = uz;
    r.m[2] = 0.0 - fx; r.m[6] = 0.0 - fy; r.m[10] = 0.0 - fz;
    r.m[12] = 0.0 - (sx * ex + sy * ey + sz * ez);
    r.m[13] = 0.0 - (ux * ex + uy * ey + uz * ez);
    r.m[14] = fx * ex + fy * ey + fz * ez;
    r
}

// ---------------------------------------------------------------- meshes
fn vtx(x: f32, y: f32, z: f32, nx: f32, ny: f32, nz: f32) -> V {
    V { x: x, y: y, z: z, nx: nx, ny: ny, nz: nz }
}

fn put(out: f32[>..]&, v: V) {
    out.push(v.x); out.push(v.y); out.push(v.z);
    out.push(v.nx); out.push(v.ny); out.push(v.nz);
}

// A triangle whose winding is set so that it faces along the mean vertex normal.
fn tri(out: f32[>..]&, a: V, b: V, c: V) {
    let ux = b.x - a.x; let uy = b.y - a.y; let uz = b.z - a.z;
    let vx = c.x - a.x; let vy = c.y - a.y; let vz = c.z - a.z;
    let gx = uy * vz - uz * vy; let gy = uz * vx - ux * vz; let gz = ux * vy - uy * vx;
    let d = gx * (a.nx + b.nx + c.nx) + gy * (a.ny + b.ny + c.ny) + gz * (a.nz + b.nz + c.nz);
    if d >= 0.0 { put(out, a); put(out, b); put(out, c); }
    else { put(out, a); put(out, c); put(out, b); }
}

fn quad(out: f32[>..]&, a: V, b: V, c: V, d: V) {
    tri(out, a, b, c);
    tri(out, a, c, d);
}

fn make_cube(out: f32[>..]&) {
    for f in 3 {
        for sgn in 2 {
            let s: f32 = if sgn == 0 { 0.5 } else { -0.5 };
            let n = if sgn == 0 { 1.0 } else { -1.0 };
            if f == 0 {
                quad(out, vtx(s, -0.5, -0.5, n, 0.0, 0.0), vtx(s, 0.5, -0.5, n, 0.0, 0.0), vtx(s, 0.5, 0.5, n, 0.0, 0.0), vtx(s, -0.5, 0.5, n, 0.0, 0.0));
            }
            if f == 1 {
                quad(out, vtx(-0.5, s, -0.5, 0.0, n, 0.0), vtx(0.5, s, -0.5, 0.0, n, 0.0), vtx(0.5, s, 0.5, 0.0, n, 0.0), vtx(-0.5, s, 0.5, 0.0, n, 0.0));
            }
            if f == 2 {
                quad(out, vtx(-0.5, -0.5, s, 0.0, 0.0, n), vtx(0.5, -0.5, s, 0.0, 0.0, n), vtx(0.5, 0.5, s, 0.0, 0.0, n), vtx(-0.5, 0.5, s, 0.0, 0.0, n));
            }
        }
    }
}

fn make_cylinder(out: f32[>..]&, segs: i32) {
    for i in segs {
        let a0 = 2.0 * PI32 * (i as f32) / (segs as f32);
        let a1 = 2.0 * PI32 * ((i + 1) as f32) / (segs as f32);
        let c0 = cos(a0); let s0 = sin(a0); let c1 = cos(a1); let s1 = sin(a1);
        quad(out, vtx(c0 * 0.5, -0.5, s0 * 0.5, c0, 0.0, s0), vtx(c1 * 0.5, -0.5, s1 * 0.5, c1, 0.0, s1),
                  vtx(c1 * 0.5, 0.5, s1 * 0.5, c1, 0.0, s1), vtx(c0 * 0.5, 0.5, s0 * 0.5, c0, 0.0, s0));
        tri(out, vtx(0.0, 0.5, 0.0, 0.0, 1.0, 0.0), vtx(c0 * 0.5, 0.5, s0 * 0.5, 0.0, 1.0, 0.0), vtx(c1 * 0.5, 0.5, s1 * 0.5, 0.0, 1.0, 0.0));
        tri(out, vtx(0.0, -0.5, 0.0, 0.0, -1.0, 0.0), vtx(c0 * 0.5, -0.5, s0 * 0.5, 0.0, -1.0, 0.0), vtx(c1 * 0.5, -0.5, s1 * 0.5, 0.0, -1.0, 0.0));
    }
}

fn make_sphere(out: f32[>..]&, rings: i32, segs: i32) {
    for i in rings {
        for j in segs {
            let a0 = PI32 * (i as f32) / (rings as f32);
            let a1 = PI32 * ((i + 1) as f32) / (rings as f32);
            let b0 = 2.0 * PI32 * (j as f32) / (segs as f32);
            let b1 = 2.0 * PI32 * ((j + 1) as f32) / (segs as f32);
            let p00 = vtx(sin(a0) * cos(b0) * 0.5, cos(a0) * 0.5, sin(a0) * sin(b0) * 0.5, sin(a0) * cos(b0), cos(a0), sin(a0) * sin(b0));
            let p10 = vtx(sin(a1) * cos(b0) * 0.5, cos(a1) * 0.5, sin(a1) * sin(b0) * 0.5, sin(a1) * cos(b0), cos(a1), sin(a1) * sin(b0));
            let p11 = vtx(sin(a1) * cos(b1) * 0.5, cos(a1) * 0.5, sin(a1) * sin(b1) * 0.5, sin(a1) * cos(b1), cos(a1), sin(a1) * sin(b1));
            let p01 = vtx(sin(a0) * cos(b1) * 0.5, cos(a0) * 0.5, sin(a0) * sin(b1) * 0.5, sin(a0) * cos(b1), cos(a0), sin(a0) * sin(b1));
            quad(out, p00, p10, p11, p01);
        }
    }
}

// A triangular prism: ridge along z, base on the bottom (a gable roof).
fn make_wedge(out: f32[>..]&) {
    let k: f32 = 0.8944272; let l: f32 = 0.4472136;
    quad(out, vtx(-0.5, -0.5, -0.5, 0.0, -1.0, 0.0), vtx(0.5, -0.5, -0.5, 0.0, -1.0, 0.0), vtx(0.5, -0.5, 0.5, 0.0, -1.0, 0.0), vtx(-0.5, -0.5, 0.5, 0.0, -1.0, 0.0));
    quad(out, vtx(0.5, -0.5, -0.5, k, l, 0.0), vtx(0.0, 0.5, -0.5, k, l, 0.0), vtx(0.0, 0.5, 0.5, k, l, 0.0), vtx(0.5, -0.5, 0.5, k, l, 0.0));
    quad(out, vtx(-0.5, -0.5, -0.5, 0.0 - k, l, 0.0), vtx(0.0, 0.5, -0.5, 0.0 - k, l, 0.0), vtx(0.0, 0.5, 0.5, 0.0 - k, l, 0.0), vtx(-0.5, -0.5, 0.5, 0.0 - k, l, 0.0));
    tri(out, vtx(-0.5, -0.5, 0.5, 0.0, 0.0, 1.0), vtx(0.5, -0.5, 0.5, 0.0, 0.0, 1.0), vtx(0.0, 0.5, 0.5, 0.0, 0.0, 1.0));
    tri(out, vtx(-0.5, -0.5, -0.5, 0.0, 0.0, -1.0), vtx(0.5, -0.5, -0.5, 0.0, 0.0, -1.0), vtx(0.0, 0.5, -0.5, 0.0, 0.0, -1.0));
}

// ---------------------------------------------------------------- state
var g_w: i32 = 1280;
var g_h: i32 = 720;
var g_objs: Obj[>..] = [];
var g_n: i32 = 0;
var g_trks: Trk[>..] = [];
var g_nt: i32 = 0;
var g_kt: f32[>..] = [];
var g_k0: f32[>..] = [];
var g_k1: f32[>..] = [];
var g_k2: f32[>..] = [];
var g_ke: i32[>..] = [];
var g_cur: f32[>..] = [];     // per object: x y z yaw sx sy sz poseA poseB blend
var g_world: f32[>..] = [];   // per object: 16 floats
var g_vis: i32[>..] = [];     // per object: bit0 visible, bit1 mirrored
// camera keys: t ex ey ez tx ty tz fov ease
var g_ct: f32[>..] = [];
var g_cv: f32[>..] = [];
var g_ce: i32[>..] = [];
var g_ncam: i32 = 0;
// lighting keys: t look
var g_lt: f32[>..] = [];
var g_ll: i32[>..] = [];
var g_nlight: i32 = 0;
var g_ground: i32 = 0;           // 0 grass 1 street 2 floor 3 plain
var g_gr: f32 = 0.62; var g_gg: f32 = 0.72; var g_gb: f32 = 0.55;
var g_gsx: f32 = 80.0; var g_gsz: f32 = 80.0;
var g_map_on: i32 = 0;
var g_mx0: f32 = 0.0; var g_mz0: f32 = 0.0; var g_mx1: f32 = 0.0; var g_mz1: f32 = 0.0;
var g_cut_ceil: i32 = 0;
var g_cut_wall: i32 = 0;
var g_user: i32 = 0;
var g_uyaw: f32 = 0.0; var g_upitch: f32 = 0.4; var g_udist: f32 = 12.0;
var g_utx: f32 = 0.0; var g_uty: f32 = 1.0; var g_utz: f32 = 0.0;
var g_vp: Mat = ident();
var g_eyex: f32 = 0.0; var g_eyey: f32 = 5.0; var g_eyez: f32 = 10.0;
var g_px: f32 = 0.0; var g_py: f32 = 0.0;
var g_lod_on: i32 = 1;
var g_lod_dist: f32 = 7.0;
var g_par: i32[>..] = [];
var g_hx: f32[>..] = [];
var g_hy: f32[>..] = [];
var g_hz: f32[>..] = [];
// sampler outputs
var g_s0: f32 = 0.0; var g_s1: f32 = 0.0; var g_s2: f32 = 0.0;
var g_pa: i32 = 0; var g_pb: i32 = 0; var g_pbl: f32 = 1.0;

export "scene_init" fn scene_init(w: i32, h: i32) {
    g_w = w; g_h = h;
    gl_init(w, h);
    var cube: f32[>..] = [];
    make_cube(cube);
    gl_mesh(0, cube);
    var cyl: f32[>..] = [];
    make_cylinder(cyl, 14);
    gl_mesh(1, cyl);
    var sph: f32[>..] = [];
    make_sphere(sph, 10, 16);
    gl_mesh(2, sph);
    var wed: f32[>..] = [];
    make_wedge(wed);
    gl_mesh(3, wed);
}

export "scene_resize" fn scene_resize(w: i32, h: i32) { g_w = w; g_h = h; gl_resize(w, h); }

export "scene_lod" fn scene_lod(on: i32, dist: f32) { g_lod_on = on; g_lod_dist = dist; }

export "skel_set" fn skel_set(i: i32, parent: i32, x: f32, y: f32, z: f32) {
    g_par.push(parent); g_hx.push(x); g_hy.push(y); g_hz.push(z);
}

export "scene_reset" fn scene_reset() {
    g_objs = []; g_n = 0; g_trks = []; g_nt = 0;
    g_kt = []; g_k0 = []; g_k1 = []; g_k2 = []; g_ke = [];
    g_cur = []; g_world = []; g_vis = [];
    g_ct = []; g_cv = []; g_ce = []; g_ncam = 0;
    g_lt = []; g_ll = []; g_nlight = 0;
    g_map_on = 0; g_cut_ceil = 0; g_cut_wall = 0;
}

// prim: 0 box 1 cylinder 2 sphere 3 wedge 4 person 5 custom mesh 6 group (not drawn).
export "obj_add" fn obj_add(prim: i32, mesh: i32, parent: i32, flags: i32, variant: i32, pose: i32, flip: i32,
                            x: f32, y: f32, z: f32, yaw: f32, rx: f32, ry: f32, rz: f32,
                            sx: f32, sy: f32, sz: f32,
                            r: f32, g: f32, b: f32, r2: f32, g2: f32, b2: f32, shadow: f32) -> i32 {
    g_objs.push(Obj { prim: prim, mesh: mesh, parent: parent, flags: flags, variant: variant, pose: pose, flip: flip,
        x: x, y: y, z: z, yaw: yaw, rx: rx, ry: ry, rz: rz, sx: sx, sy: sy, sz: sz,
        r: r, g: g, b: b, r2: r2, g2: g2, b2: b2, shadow: shadow });
    for k in 10 { g_cur.push(0.0); }
    for k in 16 { g_world.push(0.0); }
    g_vis.push(1);
    g_n += 1;
    g_n - 1
}

// channel: 0 at, 1 yaw, 2 scale, 3 pose
export "trk_begin" fn trk_begin(obj: i32, ch: i32) {
    g_trks.push(Trk { obj: obj, ch: ch, first: g_kt.len as i32, n: 0 });
    g_nt += 1;
}

// ease: 0 linear, 1 in-out, 2 step
export "key_add" fn key_add(t: f32, v0: f32, v1: f32, v2: f32, ease: i32) {
    g_kt.push(t); g_k0.push(v0); g_k1.push(v1); g_k2.push(v2); g_ke.push(ease);
    g_trks[g_nt - 1].n += 1;
}

export "cam_add" fn cam_add(t: f32, ex: f32, ey: f32, ez: f32, tx: f32, ty: f32, tz: f32, fov: f32, ease: i32) {
    g_ct.push(t);
    g_cv.push(ex); g_cv.push(ey); g_cv.push(ez); g_cv.push(tx); g_cv.push(ty); g_cv.push(tz); g_cv.push(fov);
    g_ce.push(ease);
    g_ncam += 1;
}

// look: 0 day 1 dusk 2 night 3 indoor
export "light_add" fn light_add(t: f32, look: i32) { g_lt.push(t); g_ll.push(look); g_nlight += 1; }

// kind: 0 grass 1 street 2 floor 3 plain
export "set_backdrop" fn set_backdrop(kind: i32, sx: f32, sz: f32, r: f32, g: f32, b: f32) {
    g_ground = kind; g_gsx = sx; g_gsz = sz; g_gr = r; g_gg = g; g_gb = b;
}

export "set_cutaway" fn set_cutaway(ceil: i32, walls: i32) { g_cut_ceil = ceil; g_cut_wall = walls; }

export "ground_map" fn ground_map(on: i32, x0: f32, z0: f32, x1: f32, z1: f32) {
    g_map_on = on; g_mx0 = x0; g_mz0 = z0; g_mx1 = x1; g_mz1 = z1;
}

export "cam_user" fn cam_user(on: i32, yaw: f32, pitch: f32, dist: f32, tx: f32, ty: f32, tz: f32) {
    g_user = on; g_uyaw = yaw; g_upitch = pitch; g_udist = dist; g_utx = tx; g_uty = ty; g_utz = tz;
}

// ---------------------------------------------------------------- sampling
fn ease_u(u: f32, e: i32) -> f32 {
    var r = u;
    if e == 1 { r = u * u * (3.0 - 2.0 * u); }
    if e == 2 { r = 0.0; }
    r
}

fn clamp01(u: f32) -> f32 { if u < 0.0 { 0.0 } else if u > 1.0 { 1.0 } else { u } }

// Sample a track at t into g_s0..g_s2 (values) and g_pa, g_pb, g_pbl (pose).
fn sample(ti: i32, t: f32) {
    let first = g_trks[ti].first;
    let n = g_trks[ti].n;
    var a = first;
    for i in n { if g_kt[first + i] <= t { a = first + i; } }
    let b = if a + 1 < first + n { a + 1 } else { a };
    var u: f32 = 0.0;
    if b != a && g_kt[b] > g_kt[a] { u = clamp01((t - g_kt[a]) / (g_kt[b] - g_kt[a])); }
    if t < g_kt[first] { u = 0.0; }
    u = ease_u(u, g_ke[a]);
    g_s0 = g_k0[a] + (g_k0[b] - g_k0[a]) * u;
    g_s1 = g_k1[a] + (g_k1[b] - g_k1[a]) * u;
    g_s2 = g_k2[a] + (g_k2[b] - g_k2[a]) * u;
    // pose: cross-fade from the previous key to this key over 0.3 s
    let prev = if a > first { a - 1 } else { a };
    g_pa = g_k0[prev] as i32; g_pb = g_k0[a] as i32;
    g_pbl = clamp01((t - g_kt[a]) / 0.3);
}

// ---------------------------------------------------------------- poses
fn blank() -> f32[>..] {
    var a: f32[>..] = [];
    for i in 63 { a.push(0.0); }
    a
}

fn mix_pose(a: f32[>..], b: f32[>..], k: f32) -> f32[>..] {
    var r: f32[>..] = [];
    for i in 63 { r.push(a[i] * (1.0 - k) + b[i] * k); }
    r
}

// Bones: 0 root 1 spine05 2 spine03 3 spine01 4 neck 5 head 6 clavL 7 uarmL 8 larmL 9 wristL
// 10 clavR 11 uarmR 12 larmR 13 wristR 14 ulegL 15 llegL 16 footL 17 ulegR 18 llegR 19 footR.
// Angles a[b*3+0..2] = rx, ry, rz in degrees; a[60..62] = root offset in metres.
// Pose 0 stand, 1 walk, 2 run, 3 wave, 4 point, 5 cheer, 6 sit, 7 bend.
fn pose_angles(pose: i32, t: f32) -> f32[>..] {
    var a = blank();
    a[7 * 3 + 2] = -35.0; a[11 * 3 + 2] = 35.0;
    if pose == 0 { a[2 * 3] = 1.5 * sin(t * 1.5); }
    if pose == 1 || pose == 2 {
        let run = if pose == 2 { 1.0 } else { 0.0 };
        let ph = t * (6.0 + 3.0 * run);
        let sw = 30.0 + 20.0 * run;
        a[14 * 3] = 0.0 - sw * sin(ph); a[17 * 3] = sw * sin(ph);
        a[15 * 3] = (20.0 + 30.0 * run) * max(0.0, sin(ph + 1.6)); a[18 * 3] = (20.0 + 30.0 * run) * max(0.0, 0.0 - sin(ph + 1.6));
        a[7 * 3] = (25.0 + 15.0 * run) * sin(ph); a[11 * 3] = 0.0 - (25.0 + 15.0 * run) * sin(ph);
        a[8 * 3] = 0.0 - 15.0 - 70.0 * run; a[12 * 3] = 0.0 - 15.0 - 70.0 * run;
        a[3 * 3 + 1] = 6.0 * sin(ph); a[1 * 3] = 12.0 * run;
        a[61] = 0.025 * cos(ph * 2.0) - 0.04 * run;
    }
    if pose == 3 { a[11 * 3 + 2] = -100.0; a[12 * 3 + 2] = 0.0 - 25.0 - 20.0 * sin(t * 9.0); }
    if pose == 4 { a[11 * 3] = -85.0; a[11 * 3 + 2] = 0.0; a[3 * 3 + 1] = -10.0; }
    if pose == 5 {
        a[7 * 3 + 2] = 110.0; a[11 * 3 + 2] = -110.0; a[8 * 3 + 2] = 15.0; a[12 * 3 + 2] = -15.0;
        a[5 * 3] = -15.0;
    }
    if pose == 6 {
        a[61] = -0.47; a[14 * 3] = -90.0; a[17 * 3] = -90.0; a[15 * 3] = 90.0; a[18 * 3] = 90.0;
        a[7 * 3] = -35.0; a[11 * 3] = -35.0; a[8 * 3] = -50.0; a[12 * 3] = -50.0;
    }
    if pose == 7 {
        a[1 * 3] = 45.0; a[2 * 3] = 20.0; a[14 * 3] = -20.0; a[17 * 3] = -20.0;
        a[15 * 3] = 25.0; a[18 * 3] = 25.0; a[61] = -0.1; a[7 * 3] = -30.0; a[11 * 3] = -30.0;
    }
    a
}

fn bone_matrices(a: f32[>..]) -> f32[>..] {
    var world: Mat[>..] = [];
    var out: f32[>..] = [];
    for i in 20 {
        var off = translate(g_hx[i], g_hy[i], g_hz[i]);
        let p = g_par[i];
        if p >= 0 { off = translate(g_hx[i] - g_hx[p], g_hy[i] - g_hy[p], g_hz[i] - g_hz[p]); }
        else { off = translate(g_hx[i] + a[60], g_hy[i] + a[61], g_hz[i] + a[62]); }
        let r = mul(rot_z(a[i * 3 + 2] * DEG), mul(rot_y(a[i * 3 + 1] * DEG), rot_x(a[i * 3] * DEG)));
        var w = mul(off, r);
        if p >= 0 { w = mul(world[p], w); }
        world.push(w);
        let s = mul(w, translate(0.0 - g_hx[i], 0.0 - g_hy[i], 0.0 - g_hz[i]));
        for k in 16 { out.push(s.m[k]); }
    }
    out
}

// Palette: 0 skin 1 shirt 2 pants 3 shoes 4 hair 5 eye white 6 lips 7 pupil.
fn palette(p: i32, o: Obj) -> f32[>..] {
    var c: f32[>..] = [];
    let skin = (p * 7) % 6;
    let sr = 0.93 - 0.11 * (skin as f32); let sg = 0.78 - 0.11 * (skin as f32); let sb = 0.66 - 0.10 * (skin as f32);
    c.push(sr); c.push(sg); c.push(sb);
    c.push(o.r); c.push(o.g); c.push(o.b);
    c.push(o.r2); c.push(o.g2); c.push(o.b2);
    c.push(0.12); c.push(0.10); c.push(0.10);
    let hc = (p * 3) % 4;
    if hc == 0 { c.push(0.08); c.push(0.07); c.push(0.07); }
    if hc == 1 { c.push(0.30); c.push(0.18); c.push(0.10); }
    if hc == 2 { c.push(0.62); c.push(0.60); c.push(0.58); }
    if hc == 3 { c.push(0.75); c.push(0.60); c.push(0.30); }
    c.push(0.97); c.push(0.97); c.push(0.95);
    c.push(sr * 0.88 + 0.02); c.push(sg * 0.68); c.push(sb * 0.66);
    c.push(0.10); c.push(0.08); c.push(0.07);
    c
}

// ---------------------------------------------------------------- lighting looks
// Each look: sky rgb, light dir xyz, light colour rgb.
fn look_vals(k: i32) -> f32[>..] {
    var v: f32[>..] = [];
    if k == 0 { v.push(0.93); v.push(0.91); v.push(0.86); v.push(0.4); v.push(0.8); v.push(0.5); v.push(1.0); v.push(1.0); v.push(1.0); }
    if k == 1 { v.push(0.93); v.push(0.62); v.push(0.46); v.push(-0.6); v.push(0.35); v.push(0.5); v.push(1.0); v.push(0.78); v.push(0.62); }
    if k == 2 { v.push(0.06); v.push(0.08); v.push(0.17); v.push(0.2); v.push(0.8); v.push(-0.3); v.push(0.38); v.push(0.45); v.push(0.75); }
    if k == 3 { v.push(0.90); v.push(0.89); v.push(0.86); v.push(0.3); v.push(0.9); v.push(0.4); v.push(1.0); v.push(0.97); v.push(0.92); }
    v
}

// ---------------------------------------------------------------- frame
fn world_of(i: i32) -> Mat {
    var r = ident();
    for k in 16 { r.m[k] = g_world[i * 16 + k]; }
    r
}

fn draw_person(vp: Mat, i: i32, o: Obj, t: f32) {
    let h = 0.92 + 0.016 * ((o.variant % 11) as f32);
    let wd = 0.88 + 0.025 * (((o.variant * 3) % 10) as f32);
    let model = mul(world_of(i), scale(wd, h, wd));
    let mvp = mul(vp, model);
    let tt = t + (o.variant as f32) * 0.37;
    var pose = pose_angles(g_cur[i * 10 + 7] as i32, tt);
    let bl = g_cur[i * 10 + 9];
    if bl < 1.0 { pose = mix_pose(pose_angles(g_cur[i * 10 + 7] as i32, tt), pose_angles(g_cur[i * 10 + 8] as i32, tt), bl); }
    else { pose = pose_angles(g_cur[i * 10 + 8] as i32, tt); }
    let dx = model.m[12] - g_eyex; let dy = model.m[13] - g_eyey; let dz = model.m[14] - g_eyez;
    var lod: i32 = 0;
    if g_lod_on != 0 && sqrt(dx * dx + dy * dy + dz * dz) > g_lod_dist { lod = 1; }
    var bm = bone_matrices(copy(pose));
    var pl = palette(o.variant, o);
    gl_front(g_vis[i] / 2);
    gl_draw_skin(lod, mvp, model, bm, pl, 1);
}

export "render_frame" fn render_frame(t: f64) {
    let tf = t as f32;
    // 1. current value of every object
    for i in g_n {
        let o = g_objs[i];
        g_cur[i * 10] = o.x; g_cur[i * 10 + 1] = o.y; g_cur[i * 10 + 2] = o.z; g_cur[i * 10 + 3] = o.yaw;
        g_cur[i * 10 + 4] = o.sx; g_cur[i * 10 + 5] = o.sy; g_cur[i * 10 + 6] = o.sz;
        g_cur[i * 10 + 7] = o.pose as f32; g_cur[i * 10 + 8] = o.pose as f32; g_cur[i * 10 + 9] = 1.0;
    }
    for ti in g_nt {
        let tr = g_trks[ti];
        if tr.n > 0 {
            sample(ti, tf);
            let b = tr.obj * 10;
            if tr.ch == 0 { g_cur[b] = g_s0; g_cur[b + 1] = g_s1; g_cur[b + 2] = g_s2; }
            if tr.ch == 1 { g_cur[b + 3] = g_s0; }
            if tr.ch == 2 { g_cur[b + 4] = g_s0; g_cur[b + 5] = g_s1; g_cur[b + 6] = g_s2; }
            if tr.ch == 3 { g_cur[b + 7] = g_pa as f32; g_cur[b + 8] = g_pb as f32; g_cur[b + 9] = g_pbl; }
        }
    }
    // 2. camera
    var ex = g_eyex; var ey = g_eyey; var ez = g_eyez; var tx: f32 = 0.0; var ty: f32 = 1.0; var tz: f32 = 0.0; var fov: f32 = 50.0;
    if g_ncam > 0 {
        var a: i32 = 0;
        for i in g_ncam { if g_ct[i] <= tf { a = i; } }
        let b = if a + 1 < g_ncam { a + 1 } else { a };
        var u: f32 = 0.0;
        if b != a { u = clamp01((tf - g_ct[a]) / (g_ct[b] - g_ct[a])); }
        u = ease_u(u, g_ce[a]);
        ex = g_cv[a * 7] + (g_cv[b * 7] - g_cv[a * 7]) * u;
        ey = g_cv[a * 7 + 1] + (g_cv[b * 7 + 1] - g_cv[a * 7 + 1]) * u;
        ez = g_cv[a * 7 + 2] + (g_cv[b * 7 + 2] - g_cv[a * 7 + 2]) * u;
        tx = g_cv[a * 7 + 3] + (g_cv[b * 7 + 3] - g_cv[a * 7 + 3]) * u;
        ty = g_cv[a * 7 + 4] + (g_cv[b * 7 + 4] - g_cv[a * 7 + 4]) * u;
        tz = g_cv[a * 7 + 5] + (g_cv[b * 7 + 5] - g_cv[a * 7 + 5]) * u;
        fov = g_cv[a * 7 + 6] + (g_cv[b * 7 + 6] - g_cv[a * 7 + 6]) * u;
    }
    if g_user != 0 {
        ex = g_utx + g_udist * cos(g_upitch) * sin(g_uyaw);
        ey = g_uty + g_udist * sin(g_upitch);
        ez = g_utz + g_udist * cos(g_upitch) * cos(g_uyaw);
        tx = g_utx; ty = g_uty; tz = g_utz;
    }
    g_eyex = ex; g_eyey = ey; g_eyez = ez;
    let proj = perspective(fov * DEG, (g_w as f32) / (g_h as f32), 0.1, 600.0);
    let vp = mul(proj, look_at(ex, ey, ez, tx, ty, tz));
    g_vp = vp;
    // 3. lighting
    var lk = look_vals(0);
    if g_nlight > 0 {
        var a: i32 = 0;
        for i in g_nlight { if g_lt[i] <= tf { a = i; } }
        let b = if a + 1 < g_nlight { a + 1 } else { a };
        var u: f32 = 0.0;
        if b != a { u = clamp01((tf - g_lt[a]) / (g_lt[b] - g_lt[a])); }
        u = u * u * (3.0 - 2.0 * u);
        lk = mix_pose_n(look_vals(g_ll[a]), look_vals(g_ll[b]), u);
    }
    gl_begin(lk[0], lk[1], lk[2]);
    gl_light(lk[3], lk[4], lk[5], lk[6], lk[7], lk[8]);
    // 4. ground
    let gm = mul(translate(0.0, -0.05, 0.0), scale(g_gsx, 0.1, g_gsz));
    let gmvp = mul(vp, gm);
    var gr = g_gr; var gg = g_gg; var gb = g_gb;
    if g_ground == 1 { gr = 0.36; gg = 0.37; gb = 0.39; }
    if g_ground == 2 { gr = 0.78; gg = 0.74; gb = 0.68; }
    gl_front(0);
    gl_draw(0, gmvp, gm, gr, gg, gb, 1.0, 0);
    if g_map_on != 0 {
        let mm = mul(translate((g_mx0 + g_mx1) * 0.5, 0.002, (g_mz0 + g_mz1) * 0.5), scale(g_mx1 - g_mx0, 1.0, g_mz1 - g_mz0));
        let mmvp = mul(vp, mm);
        gl_draw_ground(mmvp);
    }
    // 5. world matrices, visibility, draw
    for i in g_n {
        let o = g_objs[i];
        let b = i * 10;
        var local = mul(translate(g_cur[b], g_cur[b + 1], g_cur[b + 2]),
                    mul(rot_y(g_cur[b + 3] * DEG), mul(rot_z(o.rz * DEG), mul(rot_y(o.ry * DEG), mul(rot_x(o.rx * DEG),
                    scale(g_cur[b + 4], g_cur[b + 5], g_cur[b + 6]))))));
        var vis: i32 = 1;
        var flags = o.flags;
        var mirror = o.flip;
        if o.parent >= 0 {
            local = mul(world_of(o.parent), local);
            if g_vis[o.parent] % 2 == 0 { vis = 0; }
            if (g_vis[o.parent] / 2) % 2 == 1 { mirror = 1 - mirror; }
        }
        if (flags / FLAG_HIDDEN) % 2 == 1 { vis = 0; }
        if g_cut_ceil != 0 && (flags / FLAG_CEIL) % 2 == 1 { vis = 0; }
        if o.parent < 0 && g_cut_wall != 0 && (flags / FLAG_WALL) % 2 == 1 {
            let nx = sin(g_cur[b + 3] * DEG); let nz = cos(g_cur[b + 3] * DEG);
            if nx * (ex - g_cur[b]) + nz * (ez - g_cur[b + 2]) > 0.0 { vis = 0; }
        }
        if mirror != 0 { local.m[0] = 0.0 - local.m[0]; local.m[1] = 0.0 - local.m[1]; local.m[2] = 0.0 - local.m[2]; }
        for k in 16 { g_world[i * 16 + k] = local.m[k]; }
        g_vis[i] = vis + 2 * mirror;
        if vis != 0 {
            if o.prim == 4 { draw_person(vp, i, o, tf); }
            if o.prim >= 0 && o.prim < 4 || o.prim == 5 {
                let mesh = if o.prim == 5 { o.mesh } else { o.prim };
                let mvp = mul(vp, local);
                gl_front(mirror);
                gl_draw(mesh, mvp, local, o.r, o.g, o.b, 1.0, 1);
            }
            if o.shadow > 0.0 && o.parent < 0 {
                let sm = mul(translate(g_cur[b], 0.012, g_cur[b + 2]), scale(o.shadow * 2.0, 0.01, o.shadow * 2.0));
                let smvp = mul(vp, sm);
                gl_front(0);
                gl_draw(1, smvp, sm, 0.0, 0.0, 0.0, 0.28, 0);
            }
        }
    }
}

fn mix_pose_n(a: f32[>..], b: f32[>..], k: f32) -> f32[>..] {
    var r: f32[>..] = [];
    for i in 9 { r.push(a[i] * (1.0 - k) + b[i] * k); }
    r
}

// ---------------------------------------------------------------- projection (for labels and picking)
// Returns 1 when the point is in front of the camera. Read the result with proj_x and proj_y.
export "project" fn project(x: f32, y: f32, z: f32) -> i32 {
    let m = g_vp.m;
    let cx = m[0] * x + m[4] * y + m[8] * z + m[12];
    let cy = m[1] * x + m[5] * y + m[9] * z + m[13];
    let cw = m[3] * x + m[7] * y + m[11] * z + m[15];
    var ok: i32 = 0;
    if cw > 0.01 {
        g_px = (cx / cw * 0.5 + 0.5) * (g_w as f32);
        g_py = (1.0 - (cy / cw * 0.5 + 0.5)) * (g_h as f32);
        ok = 1;
    }
    ok
}

export "proj_x" fn proj_x() -> f32 { g_px }
export "proj_y" fn proj_y() -> f32 { g_py }

// World position of an object after the last frame.
export "obj_wx" fn obj_wx(i: i32) -> f32 { g_world[i * 16 + 12] }
export "obj_wy" fn obj_wy(i: i32) -> f32 { g_world[i * 16 + 13] }
export "obj_wz" fn obj_wz(i: i32) -> f32 { g_world[i * 16 + 14] }
export "obj_visible" fn obj_visible(i: i32) -> i32 { g_vis[i] % 2 }
export "cam_x" fn cam_x() -> f32 { g_eyex }
export "cam_y" fn cam_y() -> f32 { g_eyey }
export "cam_z" fn cam_z() -> f32 { g_eyez }
