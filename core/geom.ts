// Shared geometry helpers: part bounds, yaw maths, polygon overlap.
import type { Vec2, Vec3, Part } from '../web/types.js';
import { assert } from './assert.ts';

export type Poly = Vec2[];
export interface Bounds { min: Vec3; max: Vec3 }
export interface ModelBounds extends Bounds { size: Vec3 }

const D = Math.PI / 180;

// Rotate a vector by Euler degrees. Order: X, then Y, then Z (applied in that sequence).
export function rotEuler([x, y, z]: Vec3, [rx, ry, rz]: Vec3): Vec3 {
  let [a, b, c] = [x, y, z];
  if (rx) { const s = Math.sin(rx * D), k = Math.cos(rx * D); [b, c] = [b * k - c * s, b * s + c * k]; }
  if (ry) { const s = Math.sin(ry * D), k = Math.cos(ry * D); [a, c] = [a * k + c * s, -a * s + c * k]; }
  if (rz) { const s = Math.sin(rz * D), k = Math.cos(rz * D); [a, b] = [a * k - b * s, a * s + b * k]; }
  return [a, b, c];
}

// Yaw (degrees, counter-clockwise seen from above): +z at yaw 0, +x at yaw 90.
export function rotYaw([x, y, z]: Vec3, yaw: number): Vec3 {
  assert(typeof yaw === 'number');
  const s = Math.sin(yaw * D), k = Math.cos(yaw * D);
  return [x * k + z * s, y, -x * s + z * k];
}

const vmin = (a: Vec3, b: Vec3): Vec3 => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])];
const vmax = (a: Vec3, b: Vec3): Vec3 => [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])];

export function partBounds(p: Pick<Part, 'size' | 'pos' | 'rot'>): Bounds {
  const [sx, sy, sz] = p.size;
  let min: Vec3 = [Infinity, Infinity, Infinity], max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const ix of [-1, 1]) for (const iy of [-1, 1]) for (const iz of [-1, 1]) {
    const v = rotEuler([ix * sx / 2, iy * sy / 2, iz * sz / 2], p.rot ?? [0, 0, 0]);
    const w: Vec3 = [v[0] + p.pos[0], v[1] + p.pos[1], v[2] + p.pos[2]];
    min = vmin(min, w); max = vmax(max, w);
  }
  return { min, max };
}

export function modelBounds(parts: Pick<Part, 'size' | 'pos' | 'rot'>[]): ModelBounds {
  assert(typeof parts === 'object');
  assert(parts.length < 1e7);
  let min: Vec3 = [Infinity, Infinity, Infinity], max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const p of parts) {
    const b = partBounds(p);
    min = vmin(min, b.min); max = vmax(max, b.max);
  }
  return { min, max, size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]] };
}

// Footprint rectangle (4 corners, [x,z]) of a box centred at (cx,cz) with size (w,d) and yaw.
export function rectCorners(cx: number, cz: number, w: number, d: number, yaw: number): Poly {
  assert(typeof cx === 'number');
  assert(typeof w === 'number');
  assert(typeof d === 'number');
  assert(typeof yaw === 'number');
  assert(!Number.isNaN(cx));
  assert(!Number.isNaN(cz));
  assert(!Number.isNaN(w));
  assert(!Number.isNaN(d));
  assert(!Number.isNaN(yaw));
  const base: Vec2[] = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]];
  return base.map(([x, z]): Vec2 => {
    assert(typeof yaw === 'number');
    assert(typeof cx === 'number');
    const r = rotYaw([x, 0, z], yaw);
    return [cx + r[0], cz + r[2]];
  });
}

function shoelace(p: Poly): number {
  assert(typeof p === 'object');
  let a = 0;
  for (const [i, [x1, y1]] of p.entries()) { const [x2, y2] = p[(i + 1) % p.length] ?? [x1, y1]; a += x1 * y2 - x2 * y1; }
  return a;
}
export function polyArea(p: Poly): number {
  assert(typeof p === 'object');
  assert(p.length < 1e7);
  return Math.abs(shoelace(p)) / 2;
}

// Convex polygon clipping (Sutherland-Hodgman); both polygons convex.
export function clip(subject: Poly, clipper: Poly): Poly {
  assert(typeof subject === 'object');
  assert(typeof clipper === 'object');
  assert(subject.length < 1e7);
  assert(clipper.length < 1e7);
  const ccw = signedArea(clipper) > 0;
  let out = subject;
  for (const [i, a] of clipper.entries()) {
    if (!out.length) break;
    const b = clipper[(i + 1) % clipper.length] ?? a;
    const inside = (p: Vec2): boolean => { const c = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]); return ccw ? c >= -1e-12 : c <= 1e-12; };
    const inter = (p: Vec2, q: Vec2): Vec2 => {
      assert(typeof p === 'object');
      assert(typeof q === 'object');
      assert(Array.isArray(p));
      assert(Array.isArray(q));
      const A1 = q[1] - p[1], B1 = p[0] - q[0], C1 = A1 * p[0] + B1 * p[1];
      const A2 = b[1] - a[1], B2 = a[0] - b[0], C2 = A2 * a[0] + B2 * a[1];
      const det = A1 * B2 - A2 * B1;
      return det === 0 ? q : [(B2 * C1 - B1 * C2) / det, (A1 * C2 - A2 * C1) / det];
    };
    const input = out; out = [];
    for (const [j, cur] of input.entries()) {
      const prev = input[(j + input.length - 1) % input.length] ?? cur;
      if (inside(cur)) { if (!inside(prev)) out.push(inter(prev, cur)); out.push(cur); }
      else if (inside(prev)) out.push(inter(prev, cur));
    }
  }
  return out;
}
function signedArea(p: Poly): number {
  assert(typeof p === 'object');
  assert(p.length < 1e7);
  return shoelace(p) / 2;
}

export function overlapRatio(c1: Poly, c2: Poly): number {
  assert(typeof c1 === 'object');
  assert(typeof c2 === 'object');
  assert(c1.length < 1e7);
  assert(c2.length < 1e7);
  const inter = clip(c1, c2);
  if (inter.length < 3) return 0;
  const returned = polyArea(inter) / Math.min(polyArea(c1), polyArea(c2));
  assert(typeof returned === 'number');
  return returned;
}
