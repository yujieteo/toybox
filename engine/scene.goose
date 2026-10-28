// Spike 1: the Toybox renderer core in Goose. Goose owns the scene, the
// animation and the camera. A C shim (gl_shim.h) owns the WebGL2 calls.
// render_frame(t) is deterministic in t.

import std;
import math;

struct Mat { m: f32[16] }

extern fn gl_init(w: i32, h: i32);
extern fn gl_mesh(id: i32, data: f32[:]);
extern fn gl_begin(r: f32, g: f32, b: f32);
extern fn gl_draw(mesh: i32, mvp: Mat&, model: Mat&, r: f32, g: f32, b: f32, outline: i32);

extern fn gl_draw_skin(lod: i32, mvp: Mat&, model: Mat&, bones: f32[:], pal: f32[:], outline: i32);

let PI32: f32 = 3.14159265;

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
    // side = f x up(0,1,0)
    var sx = 0.0 - fz; var sy: f32 = 0.0; var sz = fx;
    let sl = sqrt(sx * sx + sz * sz);
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

// Meshes: interleaved position and normal, 6 floats per vertex, triangles.
fn make_cube(out: f32[>..]&) {
    let n: f32[18] = [1.0, 0.0, 0.0, -1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, -1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, -1.0];
    for f in 6 {
        let nx = n[f * 3]; let ny = n[f * 3 + 1]; let nz = n[f * 3 + 2];
        // two tangent axes
        var ux: f32 = 0.0; var uy: f32 = 0.0; var uz: f32 = 0.0;
        var vx: f32 = 0.0; var vy: f32 = 0.0; var vz: f32 = 0.0;
        if nx != 0.0 { uy = 1.0; vz = nx; }
        if ny != 0.0 { uz = 1.0; vx = ny; }
        if nz != 0.0 { ux = 1.0; vy = nz; }
        for q in 6 {
            var a: f32 = -0.5; var b: f32 = -0.5;
            if q == 1 { a = 0.5; }
            if q == 2 || q == 4 { a = 0.5; b = 0.5; }
            if q == 5 { b = 0.5; }
            out.push(nx * 0.5 + ux * a + vx * b);
            out.push(ny * 0.5 + uy * a + vy * b);
            out.push(nz * 0.5 + uz * a + vz * b);
            out.push(nx); out.push(ny); out.push(nz);
        }
    }
}

fn make_sphere(out: f32[>..]&, rings: i32, segs: i32) {
    for i in rings {
        for j in segs {
            let a0 = PI32 * i / (rings as f32);
            let a1 = PI32 * ((i + 1) as f32) / (rings as f32);
            let b0 = 2.0 * PI32 * j / (segs as f32);
            let b1 = 2.0 * PI32 * ((j + 1) as f32) / (segs as f32);
            for q in 6 {
                var a = a0; var b = b0;
                if q == 1 { a = a1; }
                if q == 2 || q == 4 { a = a1; b = b1; }
                if q == 5 { b = b1; }
                let x = sin(a) * cos(b); let y = cos(a); let z = sin(a) * sin(b);
                out.push(x * 0.5); out.push(y * 0.5); out.push(z * 0.5);
                out.push(x); out.push(y); out.push(z);
            }
        }
    }
}

var g_w: i32 = 0;
var g_h: i32 = 0;
var g_people: i32 = 50;
var g_sphere_rings: i32 = 24;

export "scene_init" fn scene_init(w: i32, h: i32, people: i32, rings: i32) {
    g_w = w; g_h = h; g_people = people; g_sphere_rings = rings;
    gl_init(w, h);
    var cube: f32[>..] = [];
    make_cube(cube);
    gl_mesh(0, cube);
    var sph: f32[>..] = [];
    make_sphere(sph, rings, rings * 2);
    gl_mesh(1, sph);
}

fn part(vp: Mat, base: Mat, mesh: i32, sx: f32, sy: f32, sz: f32, ox: f32, oy: f32, oz: f32, swing: f32, r: f32, g: f32, b: f32) {
    // Limb pivots at the top of the part: swing about x around (ox, oy, oz).
    let local = mul(translate(ox, oy, oz), mul(rot_x(swing), mul(translate(0.0, 0.0 - sy * 0.5, 0.0), scale(sx, sy, sz))));
    let model = mul(base, local);
    let mvp = mul(vp, model);
    gl_draw(mesh, mvp, model, r, g, b, 1);
}

// ---- Spike 2: skinned people. 20 bones, the pose is Euler angles per bone (degrees).
var g_mode: i32 = 0;
var g_lod_on: i32 = 1;
var g_lod_dist: f32 = 7.0;
export "scene_lod" fn scene_lod(on: i32, dist: f32) { g_lod_on = on; g_lod_dist = dist; }
var g_par: i32[>..] = [];
var g_hx: f32[>..] = [];
var g_hy: f32[>..] = [];
var g_hz: f32[>..] = [];

export "scene_mode" fn scene_mode(m: i32) { g_mode = m; }

export "skel_set" fn skel_set(i: i32, parent: i32, x: f32, y: f32, z: f32) {
    g_par.push(parent); g_hx.push(x); g_hy.push(y); g_hz.push(z);
}

let DEG: f32 = 0.0174533;

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
// Pose 0 stand, 1 walk, 2 run, 3 wave, 4 point, 5 hands up, 6 sit, 7 bend.
fn pose_angles(pose: i32, t: f32) -> f32[>..] {
    var a = blank();
    a[7 * 3 + 2] = -35.0; a[11 * 3 + 2] = 35.0;           // arms hang down
    if pose == 0 {
        a[2 * 3] = 1.5 * sin(t * 1.5);
    }
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
    if pose == 3 {
        a[11 * 3 + 2] = -100.0; a[12 * 3 + 2] = 0.0 - 25.0 - 20.0 * sin(t * 9.0);
    }
    if pose == 4 {
        a[11 * 3] = -85.0; a[11 * 3 + 2] = 0.0; a[3 * 3 + 1] = -10.0;
    }
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

// One person: world matrices down the bone chain, then skin = world * T(-bind head).
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

fn palette(p: i32) -> f32[>..] {
    var o: f32[>..] = [];
    let skin = (p * 7) % 6;
    // skin tones from light to dark
    let sr = 0.93 - 0.11 * (skin as f32); let sg = 0.78 - 0.11 * (skin as f32); let sb = 0.66 - 0.10 * (skin as f32);
    o.push(sr); o.push(sg); o.push(sb);
    let c = (p * 5) % 8;
    o.push(0.25 + 0.09 * ((c % 4) as f32)); o.push(0.30 + 0.07 * (((c + 1) % 5) as f32)); o.push(0.70 - 0.09 * ((c % 3) as f32 * 2.0));
    let d = p % 4;
    o.push(0.18 + 0.05 * (d as f32)); o.push(0.18 + 0.03 * (d as f32)); o.push(0.28);
    o.push(0.12); o.push(0.10); o.push(0.10);
    // hair: black, brown, grey, blond
    let hc = (p * 3) % 4;
    if hc == 0 { o.push(0.08); o.push(0.07); o.push(0.07); }
    if hc == 1 { o.push(0.30); o.push(0.18); o.push(0.10); }
    if hc == 2 { o.push(0.62); o.push(0.60); o.push(0.58); }
    if hc == 3 { o.push(0.75); o.push(0.60); o.push(0.30); }
    o.push(0.97); o.push(0.97); o.push(0.95);                      // eye white
    o.push(sr * 0.88 + 0.02); o.push(sg * 0.68); o.push(sb * 0.66);  // lips
    o.push(0.10); o.push(0.08); o.push(0.07);                      // pupil
    o
}

fn draw_person(vp: Mat, base: Mat, p: i32, pose: f32[>..], cx: f32, cy: f32, cz: f32) {
    let dx = base.m[12] - cx; let dy = base.m[13] - cy; let dz = base.m[14] - cz;
    var lod: i32 = 0;
    if g_lod_on != 0 && sqrt(dx * dx + dy * dy + dz * dz) > g_lod_dist { lod = 1; }
    let h = 0.92 + 0.016 * ((p % 11) as f32);
    let wd = 0.88 + 0.025 * (((p * 3) % 10) as f32);
    let model = mul(base, scale(wd, h, wd));
    let mvp = mul(vp, model);
    var bm = bone_matrices(copy(pose));
    var pl = palette(p);
    gl_draw_skin(lod, mvp, model, bm, pl, 1);
}

fn render_people(tf: f32) {
    gl_begin(0.93, 0.91, 0.86);
    let proj = perspective(0.9, (g_w as f32) / (g_h as f32), 0.1, 100.0);
    if g_mode == 3 {
        // Face close-up of one person (people = person number).
        let view = look_at(0.15, 1.62, 1.0, 0.0, 1.58, 0.0);
        let vp = mul(proj, view);
        draw_person(vp, ident(), g_people, pose_angles(0, tf), 0.15, 1.62, 1.0);
        return;
    }
    if g_mode == 2 {
        // Pose sheet: 24 different people, 8 poses, 3 rows. Static camera.
        let view = look_at(0.0, 2.2, 10.5, 0.0, 0.9, 0.0);
        let vp = mul(proj, view);
        let gm = mul(translate(0.0, -0.05, 0.0), scale(40.0, 0.1, 40.0));
        let gmvp = mul(vp, gm);
        gl_draw(0, gmvp, gm, 0.62, 0.72, 0.55, 0);
        for pp in 24 {
            let p = pp as i32;
            let row = p / 8; let col = p % 8;
            let base = translate(((col as f32) - 3.5) * 1.5, 0.0, ((row as f32) - 1.0) * 1.8);
            draw_person(vp, base, p, pose_angles(col, tf), 0.0, 2.2, 10.5);
        }
        return;
    }
    let ang = tf * 0.25;
    let view = look_at(sin(ang) * 14.0, 6.0, cos(ang) * 14.0, 0.0, 1.0, 0.0);
    let vp = mul(proj, view);
    let gm = mul(translate(0.0, -0.05, 0.0), scale(40.0, 0.1, 40.0));
    let gmvp = mul(vp, gm);
        gl_draw(0, gmvp, gm, 0.62, 0.72, 0.55, 0);
    for p in g_people {
        let pf = p as f32;
        let ring = 3.0 + ((p % 5) as f32) * 1.4;
        let speed = 0.35 + 0.05 * ((p % 3) as f32);
        let a = pf * 0.9 + tf * speed;
        let base = mul(translate(cos(a) * ring, 0.0, sin(a) * ring), rot_y(PI32 - a));
        var pose = pose_angles(1, tf + pf * 0.37);
        if p % 6 == 0 { pose = mix_pose(pose_angles(1, tf + pf), pose_angles(3, tf + pf), 0.5 + 0.5 * sin(tf * 0.7 + pf)); }
        draw_person(vp, base, p % 24, copy(pose), sin(ang) * 14.0, 6.0, cos(ang) * 14.0);
    }
}

export "render_frame" fn render_frame(t: f64) {
    let tf = t as f32;
    if g_mode > 0 { render_people(tf); return; }
    gl_begin(0.93, 0.91, 0.86);
    // Camera: a slow orbit around the crowd.
    let ang = tf * 0.25;
    let view = look_at(sin(ang) * 14.0, 6.0, cos(ang) * 14.0, 0.0, 1.0, 0.0);
    let proj = perspective(0.9, (g_w as f32) / (g_h as f32), 0.1, 100.0);
    let vp = mul(proj, view);
    // Ground.
    let gm = mul(translate(0.0, -0.05, 0.0), scale(40.0, 0.1, 40.0));
    let gmvp = mul(vp, gm);
    gl_draw(0, gmvp, gm, 0.62, 0.72, 0.55, 0);
    // The crowd walks in rings.
    for p in g_people {
        let pf = p as f32;
        let ring = 3.0 + ((p % 5) as f32) * 1.4;
        let speed = 0.35 + 0.05 * ((p % 3) as f32);
        let a = pf * 0.9 + tf * speed;
        let px = cos(a) * ring; let pz = sin(a) * ring;
        let base = mul(translate(px, 0.0, pz), rot_y(0.0 - a + PI32));
        let ph = tf * 5.0 + pf;
        let sw = sin(ph) * 0.6;
        let cr = 0.3 + 0.1 * ((p % 4) as f32); let cg = 0.35 + 0.08 * ((p % 5) as f32); let cb = 0.6 - 0.07 * ((p % 3) as f32);
        // legs, torso, arms, head
        part(vp, base, 0, 0.18, 0.8, 0.2, 0.12, 0.8, 0.0, sw, 0.2, 0.2, 0.3);
        part(vp, base, 0, 0.18, 0.8, 0.2, -0.12, 0.8, 0.0, 0.0 - sw, 0.2, 0.2, 0.3);
        part(vp, base, 0, 0.5, 0.7, 0.28, 0.0, 1.5, 0.0, 0.0, cr, cg, cb);
        part(vp, base, 0, 0.14, 0.65, 0.16, 0.34, 1.5, 0.0, 0.0 - sw, cr, cg, cb);
        part(vp, base, 0, 0.14, 0.65, 0.16, -0.34, 1.5, 0.0, sw, cr, cg, cb);
        let hm = mul(base, mul(translate(0.0, 1.75, 0.0), scale(0.3, 0.3, 0.3)));
        let hmvp = mul(vp, hm);
        gl_draw(1, hmvp, hm, 0.9, 0.72, 0.6, 1);
    }
}
