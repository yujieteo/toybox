// Shared geometry helpers: part bounds, yaw maths, polygon overlap.
const D = Math.PI / 180;

// Rotate a vector by Euler degrees. Order: X, then Y, then Z (applied in that sequence).
export function rotEuler([x, y, z], [rx, ry, rz]) {
  let [a, b, c] = [x, y, z];
  if (rx) { const s = Math.sin(rx * D), k = Math.cos(rx * D); [b, c] = [b * k - c * s, b * s + c * k]; }
  if (ry) { const s = Math.sin(ry * D), k = Math.cos(ry * D); [a, c] = [a * k + c * s, -a * s + c * k]; }
  if (rz) { const s = Math.sin(rz * D), k = Math.cos(rz * D); [a, b] = [a * k - b * s, a * s + b * k]; }
  return [a, b, c];
}

// Yaw (degrees, counter-clockwise seen from above): +z at yaw 0, +x at yaw 90.
export function rotYaw([x, y, z], yaw) {
  const s = Math.sin(yaw * D), k = Math.cos(yaw * D);
  return [x * k + z * s, y, -x * s + z * k];
}

export function partBounds(p) {
  const [sx, sy, sz] = p.size;
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const ix of [-1, 1]) for (const iy of [-1, 1]) for (const iz of [-1, 1]) {
    const v = rotEuler([ix * sx / 2, iy * sy / 2, iz * sz / 2], p.rot || [0, 0, 0]);
    for (let i = 0; i < 3; i++) {
      const w = v[i] + p.pos[i];
      if (w < min[i]) min[i] = w;
      if (w > max[i]) max[i] = w;
    }
  }
  return { min, max };
}

export function modelBounds(parts) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const p of parts) {
    const b = partBounds(p);
    for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], b.min[i]); max[i] = Math.max(max[i], b.max[i]); }
  }
  return { min, max, size: max.map((v, i) => v - min[i]) };
}

// Footprint rectangle (4 corners, [x,z]) of a box centred at (cx,cz) with size (w,d) and yaw.
export function rectCorners(cx, cz, w, d, yaw) {
  return [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([x, z]) => {
    const r = rotYaw([x, 0, z], yaw);
    return [cx + r[0], cz + r[2]];
  });
}

export function polyArea(p) {
  let a = 0;
  for (let i = 0; i < p.length; i++) { const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length]; a += x1 * y2 - x2 * y1; }
  return Math.abs(a) / 2;
}

// Convex polygon clipping (Sutherland-Hodgman); both polygons convex.
export function clip(subject, clipper) {
  const ccw = signedArea(clipper) > 0;
  let out = subject;
  for (let i = 0; i < clipper.length && out.length; i++) {
    const a = clipper[i], b = clipper[(i + 1) % clipper.length];
    const inside = (p) => { const c = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]); return ccw ? c >= -1e-12 : c <= 1e-12; };
    const inter = (p, q) => {
      const A1 = q[1] - p[1], B1 = p[0] - q[0], C1 = A1 * p[0] + B1 * p[1];
      const A2 = b[1] - a[1], B2 = a[0] - b[0], C2 = A2 * a[0] + B2 * a[1];
      const det = A1 * B2 - A2 * B1;
      return det === 0 ? q : [(B2 * C1 - B1 * C2) / det, (A1 * C2 - A2 * C1) / det];
    };
    const input = out; out = [];
    for (let j = 0; j < input.length; j++) {
      const cur = input[j], prev = input[(j + input.length - 1) % input.length];
      if (inside(cur)) { if (!inside(prev)) out.push(inter(prev, cur)); out.push(cur); }
      else if (inside(prev)) out.push(inter(prev, cur));
    }
  }
  return out;
}
function signedArea(p) {
  let a = 0;
  for (let i = 0; i < p.length; i++) { const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length]; a += x1 * y2 - x2 * y1; }
  return a / 2;
}

export function overlapRatio(c1, c2) {
  const inter = clip(c1, c2);
  if (inter.length < 3) return 0;
  return polyArea(inter) / Math.min(polyArea(c1), polyArea(c2));
}
