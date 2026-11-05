"""MakeHuman base mesh + default skeleton + weights (all CC0) -> mesh_full.bin, mesh_lod.bin, skel.json.

Usage: python3 -I prep.py MHDIR OUTDIR [LOD_TRIS]
Keeps the "body" group, collapses 163 bones to 20, keeps 4 weights per vertex.
Regions: 0 skin 1 shirt 2 pants 3 shoes 4 hair 5 eye white 6 lips 7 pupil.
The LOD body comes from vertex clustering (cells keyed by position and main bone).
"""

from __future__ import annotations

import json
import math
import struct
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

KEEP = [
    "root", "spine05", "spine03", "spine01", "neck01", "head",
    "clavicle.L", "upperarm01.L", "lowerarm01.L", "wrist.L",
    "clavicle.R", "upperarm01.R", "lowerarm01.R", "wrist.R",
    "upperleg01.L", "lowerleg01.L", "foot.L", "upperleg01.R", "lowerleg01.R", "foot.R",
]  # fmt: skip
REGION = {
    "head": 0, "neck01": 0, "wrist.L": 0, "wrist.R": 0, "lowerarm01.L": 0, "lowerarm01.R": 0,
    "spine01": 1, "spine03": 1, "spine05": 1, "clavicle.L": 1, "clavicle.R": 1,
    "upperarm01.L": 1, "upperarm01.R": 1,
    "root": 2, "upperleg01.L": 2, "upperleg01.R": 2, "lowerleg01.L": 2, "lowerleg01.R": 2,
    "foot.L": 3, "foot.R": 3,
}  # fmt: skip
DEFAULT_LOD_TRIS = 4000
BODY_HEIGHT = 1.7
LIPS_MIN = 0.5
HAIR_ABOVE = 0.075
HAIR_BEHIND_BELOW = 0.03
HAIR_BEHIND_Z = 0.07
REGION_HAIR = 4
REGION_LIPS = 6
MAX_WEIGHTS = 4
LOD_STEPS = 14
LOD_LOW = 0.005
LOD_HIGH = 0.2
MAX_VERTS = 10**7
MIN_FACE = 3
DIMS = 3
MIN_ARGS = 2

Vec3 = list[float]
Weights = dict[int, float]
Tri = tuple[int, int, int]


@dataclass
class Vertex:
    """One output vertex: position, normal, region and up to four weights."""

    p: Vec3
    n: Vec3
    reg: int
    w: list[tuple[int, float]]


@dataclass
class Body:
    """The kept part of the MakeHuman body, scaled to the body height."""

    sk: dict[str, Any]
    verts: list[Vec3]
    ymin: float
    scale: float
    pos: list[Vec3]
    tris: list[Tri]
    bw: list[Weights]
    lips: list[float]
    eye_l: Vec3
    eye_r: Vec3
    hy: float
    hz: float


def read_obj(path: Path) -> tuple[list[Vec3], list[list[int]]]:
    """Read the vertices and the faces of the "body" group of an OBJ file."""
    assert path.is_file(), "the base mesh must exist"
    assert path.suffix == ".obj", "the base mesh is an OBJ file"
    verts: list[Vec3] = []
    faces: list[list[int]] = []
    grp: str | None = None
    for ln in path.open():
        p = ln.split()
        if not p:
            continue
        if p[0] == "v":
            verts.append([float(x) for x in p[1:4]])
        elif p[0] == "g":
            grp = p[1]
        elif p[0] == "f" and grp == "body":
            faces.append([int(t.split("/")[0]) - 1 for t in p[1:]])
    assert len(verts) < MAX_VERTS, "the mesh is bounded"
    assert all(len(f) >= MIN_FACE for f in faces), "a face has at least three corners"
    return verts, faces


def up(sk: dict[str, Any], b: str | None) -> str | None:
    """Return the nearest kept bone at or above bone b."""
    assert "bones" in sk, "a skeleton has bones"
    assert b is None or b in sk["bones"], "the bone is in the skeleton"
    while b not in KEEP and b is not None:
        b = sk["bones"][b]["parent"]
    return b


def kept_parent(sk: dict[str, Any], b: str) -> str | None:
    """Return the nearest kept bone above bone b."""
    assert b in sk["bones"], "the bone is in the skeleton"
    assert "bones" in sk, "a skeleton has bones"
    return up(sk, sk["bones"][b]["parent"])


def head(body_sk: dict[str, Any], verts: list[Vec3], ymin: float, scale: float, b: str) -> Vec3:
    """Return the head position of bone b in body units."""
    assert scale > 0, "the scale is positive"
    assert b in body_sk["bones"], "the bone is in the skeleton"
    ids: list[int] = body_sk["joints"][body_sk["bones"][b]["head"]]
    ps = [verts[i] for i in ids]
    h = [sum(p[k] for p in ps) / len(ps) for k in range(3)]
    return [h[0] * scale, (h[1] - ymin) * scale, h[2] * scale]


def build_weights(
    sk: dict[str, Any], w_in: dict[str, list[list[float]]], remap: dict[int, int], count: int
) -> tuple[list[Weights], list[float]]:
    """Return the weights of each kept vertex on the kept bones, and its lip weight."""
    assert count == len(set(remap.values())), "the remap is one to one"
    assert all(v < count for v in remap.values()), "the remap points inside the mesh"
    bw: list[Weights] = [{} for _ in range(count)]
    lips = [0.0] * count
    for b, lst in w_in.items():
        k = up(sk, b) or "root"
        for vi, w in lst:
            if int(vi) in remap:
                i = remap[int(vi)]
                bw[i][KEEP.index(k)] = bw[i].get(KEEP.index(k), 0) + w
                if b.startswith("oris"):
                    lips[i] += w
    return bw, lips


def load_body(mh: Path, tri_limit: int) -> Body:
    """Read the MakeHuman files and scale the body to 1.7 units."""
    assert mh.is_dir(), "MHDIR is a folder"
    assert tri_limit > 0, "the LOD has a triangle limit"
    sk: dict[str, Any] = json.loads((mh / "default.mhskel").read_text())
    w_in: dict[str, list[list[float]]] = json.loads((mh / "default_weights.mhw").read_text())["weights"]
    verts, faces = read_obj(mh / "base.obj")
    used = sorted({i for f in faces for i in f})
    remap = {o: n for n, o in enumerate(used)}
    pos = [verts[i] for i in used]
    ymin = min(p[1] for p in pos)
    ymax = max(p[1] for p in pos)
    scale = BODY_HEIGHT / (ymax - ymin)
    pos = [[p[0] * scale, (p[1] - ymin) * scale, p[2] * scale] for p in pos]
    bw, lips = build_weights(sk, w_in, remap, len(pos))
    tris: list[Tri] = []
    for f in faces:
        g = [remap[i] for i in f]
        tris.extend((g[0], g[i], g[i + 1]) for i in range(1, len(g) - 1))
    eye_l = head(sk, verts, ymin, scale, "eye.L")
    eye_r = head(sk, verts, ymin, scale, "eye.R")
    return Body(sk, verts, ymin, scale, pos, tris, bw, lips, eye_l, eye_r, (eye_l[1] + eye_r[1]) / 2, eye_l[2])


def region(body: Body, i: int) -> int:
    """Return the region of vertex i: skin, shirt, pants, shoes, hair or lips."""
    assert 0 <= i < len(body.pos), "the vertex exists"
    assert body.bw[i], "the vertex has a weight"
    top = max(body.bw[i].items(), key=lambda kv: kv[1])[0]
    r = REGION[KEEP[top]]
    if KEEP[top] == "head":
        _x, y, z = body.pos[i]
        if body.lips[i] > LIPS_MIN:
            return REGION_LIPS
        # hair: above the hairline, or behind the ears
        if y > body.hy + HAIR_ABOVE or (y > body.hy - HAIR_BEHIND_BELOW and z < body.hz - HAIR_BEHIND_Z):
            return REGION_HAIR
    return r


def normals(pts: list[Vec3], tris: list[Tri]) -> list[Vec3]:
    """Return the unnormalised vertex normals: the sum of the face normals around each vertex."""
    assert all(max(t) < len(pts) for t in tris), "every triangle points at a vertex"
    assert all(len(p) == DIMS for p in pts), "points are 3D"
    nrm: list[Vec3] = [[0, 0, 0] for _ in pts]
    for a, b, c in tris:
        u = [pts[b][k] - pts[a][k] for k in range(3)]
        v = [pts[c][k] - pts[a][k] for k in range(3)]
        n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
        for i in (a, b, c):
            for k in range(3):
                nrm[i][k] += n[k]
    return nrm


def top4(d: Weights) -> list[tuple[int, float]]:
    """Return the four biggest weights, scaled to add up to 1."""
    assert all(w >= 0 for w in d.values()), "weights are not negative"
    assert all(j >= 0 for j in d), "bone numbers are not negative"
    t = sorted(d.items(), key=lambda kv: -kv[1])[:MAX_WEIGHTS]
    while len(t) < MAX_WEIGHTS:
        t.append((0, 0.0))
    tot = sum(w for _, w in t) or 1
    return [(j, w / tot) for j, w in t]


@dataclass
class Ball:
    """A sphere to add: centre, radius, bone, region, rings, segments and the depth scale."""

    c: Vec3
    r: float
    bone: int
    reg: int
    rings: int
    segs: int
    zscale: float = 1.0


def sphere(ball: Ball, out: tuple[list[Vertex], list[Tri]]) -> None:
    """Add a sphere with the given rings and segments to the vertices and triangles."""
    c, r, rings, segs = ball.c, ball.r, ball.rings, ball.segs
    verts, tris = out
    assert rings > 0, "a sphere has rings"
    assert segs > 0, "a sphere has segments"
    base = len(verts)
    for i in range(rings + 1):
        a = math.pi * i / rings
        for j in range(segs):
            b = 2 * math.pi * j / segs
            n = (math.sin(a) * math.cos(b), math.cos(a), math.sin(a) * math.sin(b))
            p = [c[0] + n[0] * r, c[1] + n[1] * r, c[2] + n[2] * r * ball.zscale]
            verts.append(Vertex(p, list(n), ball.reg, [(ball.bone, 1.0)]))
    for i in range(rings):
        for j in range(segs):
            a = base + i * segs + j
            b = base + i * segs + (j + 1) % segs
            c2 = base + (i + 1) * segs + j
            d = base + (i + 1) * segs + (j + 1) % segs
            tris.append((a, c2, b))
            tris.append((b, c2, d))


def eyes(body: Body, out: tuple[list[Vertex], list[Tri]], rings: int, segs: int) -> None:
    """Add both eyes: a white ball and a small pupil cap in front of it."""
    assert rings >= 1, "the eye has rings"
    assert segs >= 1, "the eye has segments"
    hb = KEEP.index("head")
    for e in (body.eye_l, body.eye_r):
        # sphere axis is y; the rotated copy would cost code, so the iris is a small cap in front
        sphere(Ball([e[0], e[1], e[2] + 0.008], 0.0135, hb, 5, rings, segs), out)
        sphere(Ball([e[0], e[1], e[2] + 0.0205], 0.0068, hb, 7, max(3, rings - 2), max(5, segs - 2), 0.5), out)


def emit(path: Path, verts: list[Vertex], tris: list[Tri]) -> int:
    """Write a mesh file. Triangle winding is kept as given. Returns the size in bytes."""
    assert path.parent.is_dir(), "the output folder exists"
    assert all(len(v.w) <= MAX_WEIGHTS for v in verts), "at most four weights"
    buf = bytearray(struct.pack("<II", len(verts), len(tris) * 3))
    for v in verts:
        n = v.n
        ln = math.sqrt(sum(x * x for x in n)) or 1
        w = v.w + [(0, 0.0)] * (MAX_WEIGHTS - len(v.w))
        buf += struct.pack("<7f", v.p[0], v.p[1], v.p[2], n[0] / ln, n[1] / ln, n[2] / ln, float(v.reg))
        buf += struct.pack("<4f", *[float(j) for j, _ in w]) + struct.pack("<4f", *[x for _, x in w])
    for t in tris:
        buf += struct.pack("<3H", *t)
    path.write_bytes(bytes(buf))
    return len(buf)


def cluster(body: Body, cell: float) -> tuple[list[list[int]], list[Tri]]:
    """Group the vertices into cells keyed by position and main bone; keep the unique triangles."""
    assert cell > 0, "the cell has a size"
    assert body.pos, "there are vertices"
    key: dict[tuple[int, int, int, int], int] = {}
    cl: list[list[int]] = []
    m: list[int] = []
    for i, p in enumerate(body.pos):
        main = max(body.bw[i].items(), key=lambda kv: kv[1])[0]
        k = (int(p[0] // cell), int(p[1] // cell), int(p[2] // cell), main)
        if k not in key:
            key[k] = len(cl)
            cl.append([])
        cl[key[k]].append(i)
        m.append(key[k])
    seen: set[tuple[int, ...]] = set()
    tris2: list[Tri] = []
    for a, b, c in body.tris:
        t = (m[a], m[b], m[c])
        if len(set(t)) < MIN_FACE:
            continue
        k2 = tuple(sorted(t))
        if k2 in seen:
            continue
        seen.add(k2)
        tris2.append(t)
    return cl, tris2


def find_cell(body: Body, tri_limit: int) -> float:
    """Search for the smallest cell whose clustering has at most tri_limit triangles."""
    assert tri_limit > 0, "the LOD has a triangle limit"
    assert LOD_LOW < LOD_HIGH, "the search range is not empty"
    lo, hi = LOD_LOW, LOD_HIGH
    for _ in range(LOD_STEPS):
        mid = (lo + hi) / 2
        _cl, t2 = cluster(body, mid)
        if len(t2) > tri_limit:
            lo = mid
        else:
            hi = mid
    return hi


def lod_vertices(body: Body, cl: list[list[int]], t2: list[Tri]) -> list[Vertex]:
    """One vertex for each cluster: the mean position, the summed weights and the majority region."""
    assert all(members for members in cl), "no cluster is empty"
    assert all(max(t) < len(cl) for t in t2), "every triangle points at a cluster"
    pts: list[Vec3] = []
    ws: list[list[tuple[int, float]]] = []
    regs: list[int] = []
    for members in cl:
        pts.append([sum(body.pos[i][k] for i in members) / len(members) for k in range(3)])
        d: Weights = {}
        for i in members:
            for j, w in body.bw[i].items():
                d[j] = d.get(j, 0) + w
        ws.append(top4(d))
        votes: dict[int, int] = {}
        for i in members:
            r = region(body, i)
            votes[r] = votes.get(r, 0) + 1
        regs.append(max(votes.items(), key=lambda kv: kv[1])[0])
    n2 = normals(pts, t2)
    return [Vertex(pts[i], n2[i], regs[i], ws[i]) for i in range(len(pts))]


def write_skeleton(body: Body, out: Path) -> None:
    """Write skel.json: the kept bones, their parents and their head positions."""
    assert out.is_dir(), "the output folder exists"
    assert all(b in body.sk["bones"] for b in KEEP), "every kept bone is in the skeleton"
    heads = {b: head(body.sk, body.verts, body.ymin, body.scale, b) for b in KEEP}
    bones = [{"name": b, "parent": KEEP.index(p) if (p := kept_parent(body.sk, b)) else -1, "head": heads[b]} for b in KEEP]
    with (out / "skel.json").open("w") as f:
        json.dump({"bones": bones}, f)


def main(argv: list[str]) -> None:
    """Make the full mesh, the LOD mesh and the skeleton."""
    assert len(argv) >= MIN_ARGS, "usage: prep.py MHDIR OUTDIR [LOD_TRIS]"
    assert argv[0] != argv[1], "the output folder is not the input folder"
    mh, out = Path(argv[0]), Path(argv[1])
    lod_tris = int(argv[2]) if len(argv) > MIN_ARGS else DEFAULT_LOD_TRIS
    body = load_body(mh, lod_tris)
    nrm = normals(body.pos, body.tris)
    full = [Vertex(body.pos[i], nrm[i], region(body, i), top4(body.bw[i])) for i in range(len(body.pos))]
    tris = list(body.tris)
    eyes(body, (full, tris), 8, 12)
    sz_full = emit(out / "mesh_full.bin", full, tris)
    nfull = len(tris)
    hi = find_cell(body, lod_tris)
    cl, t2 = cluster(body, hi)
    lod = lod_vertices(body, cl, t2)
    eyes(body, (lod, t2), 4, 6)
    sz_lod = emit(out / "mesh_lod.bin", lod, t2)
    write_skeleton(body, out)
    sys.stdout.write(
        f"full verts {len(full)} tris {nfull} bytes {sz_full} | lod verts {len(lod)} tris {len(t2)} bytes {sz_lod} cell {round(hi, 4)}\n"
    )


if __name__ == "__main__":
    main(sys.argv[1:])
