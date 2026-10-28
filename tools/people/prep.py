# MakeHuman base mesh + default skeleton + weights (all CC0) -> mesh_full.bin, mesh_lod.bin, skel.json.
# Usage: python3 -I prep.py MHDIR OUTDIR
# Keeps the "body" group, collapses 163 bones to 20, keeps 4 weights per vertex.
# Regions: 0 skin 1 shirt 2 pants 3 shoes 4 hair 5 eye white 6 lips 7 pupil.
# The LOD body comes from vertex clustering (cells keyed by position and main bone).
import json, struct, sys, math
mh, out = sys.argv[1], sys.argv[2]
LOD_TRIS = int(sys.argv[3]) if len(sys.argv) > 3 else 4000
KEEP = ['root','spine05','spine03','spine01','neck01','head',
        'clavicle.L','upperarm01.L','lowerarm01.L','wrist.L',
        'clavicle.R','upperarm01.R','lowerarm01.R','wrist.R',
        'upperleg01.L','lowerleg01.L','foot.L','upperleg01.R','lowerleg01.R','foot.R']
REGION = {'head':0,'neck01':0,'wrist.L':0,'wrist.R':0,'lowerarm01.L':0,'lowerarm01.R':0,
          'spine01':1,'spine03':1,'spine05':1,'clavicle.L':1,'clavicle.R':1,'upperarm01.L':1,'upperarm01.R':1,
          'root':2,'upperleg01.L':2,'upperleg01.R':2,'lowerleg01.L':2,'lowerleg01.R':2,'foot.L':3,'foot.R':3}
sk = json.load(open(f'{mh}/default.mhskel'))
W = json.load(open(f'{mh}/default_weights.mhw'))['weights']
verts, faces, grp = [], [], None
for ln in open(f'{mh}/base.obj'):
    p = ln.split()
    if not p: continue
    if p[0] == 'v': verts.append([float(x) for x in p[1:4]])
    elif p[0] == 'g': grp = p[1]
    elif p[0] == 'f' and grp == 'body':
        faces.append([int(t.split('/')[0]) - 1 for t in p[1:]])
used = sorted({i for f in faces for i in f}); remap = {o: n for n, o in enumerate(used)}
pos = [verts[i] for i in used]
ymin = min(p[1] for p in pos); ymax = max(p[1] for p in pos); s = 1.7 / (ymax - ymin)
pos = [[p[0]*s, (p[1]-ymin)*s, p[2]*s] for p in pos]
def head(b):
    ids = sk['joints'][sk['bones'][b]['head']]
    ps = [verts[i] for i in ids]
    h = [sum(p[k] for p in ps)/len(ps) for k in range(3)]
    return [h[0]*s, (h[1]-ymin)*s, h[2]*s]
def up(b):
    while b not in KEEP and b is not None: b = sk['bones'][b]['parent']
    return b
def kept_parent(b): return up(sk['bones'][b]['parent'])
heads = {b: head(b) for b in KEEP}
bw = [dict() for _ in pos]; lips = [0.0] * len(pos)
for b, lst in W.items():
    k = up(b) or 'root'
    for vi, w in lst:
        if vi in remap:
            bw[remap[vi]][KEEP.index(k)] = bw[remap[vi]].get(KEEP.index(k), 0) + w
            if b.startswith('oris'): lips[remap[vi]] += w
tris = []
for f in faces:
    f = [remap[i] for i in f]
    for i in range(1, len(f)-1): tris.append((f[0], f[i], f[i+1]))
eyeL, eyeR = head('eye.L'), head('eye.R')
hy = (eyeL[1] + eyeR[1]) / 2; hz = eyeL[2]
def region(i):
    top = max(bw[i].items(), key=lambda kv: kv[1])[0]
    r = REGION[KEEP[top]]
    if KEEP[top] == 'head':
        x, y, z = pos[i]
        if lips[i] > 0.5: return 6
        # hair: above the hairline, or behind the ears
        if y > hy + 0.075 or (y > hy - 0.03 and z < hz - 0.07): return 4
    return r
def normals(P, T):
    nrm = [[0, 0, 0] for _ in P]
    for a, b, c in T:
        u = [P[b][k]-P[a][k] for k in range(3)]; v = [P[c][k]-P[a][k] for k in range(3)]
        n = [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]]
        for i in (a, b, c):
            for k in range(3): nrm[i][k] += n[k]
    return nrm
def top4(d):
    t = sorted(d.items(), key=lambda kv: -kv[1])[:4]
    while len(t) < 4: t.append((0, 0.0))
    tot = sum(w for _, w in t) or 1
    return [(j, w / tot) for j, w in t]
def sphere(c, r, bone, reg, rings, segs, V, T, zscale=1.0):
    base = len(V)
    for i in range(rings + 1):
        a = math.pi * i / rings
        for j in range(segs):
            b = 2 * math.pi * j / segs
            n = (math.sin(a)*math.cos(b), math.cos(a), math.sin(a)*math.sin(b))
            V.append(dict(p=[c[0]+n[0]*r, c[1]+n[1]*r, c[2]+n[2]*r*zscale], n=list(n), reg=reg, w=[(bone, 1.0)]))
    for i in range(rings):
        for j in range(segs):
            a = base + i*segs + j; b = base + i*segs + (j+1) % segs
            c2 = base + (i+1)*segs + j; d = base + (i+1)*segs + (j+1) % segs
            T.append((a, c2, b)); T.append((b, c2, d))
def eyes(V, T, rings, segs):
    hb = KEEP.index('head')
    for e in (eyeL, eyeR):
        # sphere axis is y; the rotated copy would cost code, so the iris is a small cap in front
        sphere([e[0], e[1], e[2] + 0.008], 0.0135, hb, 5, rings, segs, V, T)
        sphere([e[0], e[1], e[2] + 0.0205], 0.0068, hb, 7, max(3, rings - 2), max(5, segs - 2), V, T, 0.5)
def emit(name, V, T):
    # triangle winding: keep as given. V items: p, n, reg, w
    buf = bytearray(struct.pack('<II', len(V), len(T) * 3))
    for v in V:
        n = v['n']; l = math.sqrt(sum(x*x for x in n)) or 1
        w = v['w'] + [(0, 0.0)] * (4 - len(v['w']))
        buf += struct.pack('<7f', v['p'][0], v['p'][1], v['p'][2], n[0]/l, n[1]/l, n[2]/l, float(v['reg']))
        buf += struct.pack('<4f', *[float(j) for j, _ in w]) + struct.pack('<4f', *[x for _, x in w])
    for t in T: buf += struct.pack('<3H', *t)
    open(f'{out}/{name}', 'wb').write(buf)
    return len(buf)
# full body
nrm = normals(pos, tris)
V = [dict(p=pos[i], n=nrm[i], reg=region(i), w=top4(bw[i])) for i in range(len(pos))]
T = list(tris)
eyes(V, T, 8, 12)
sz_full = emit('mesh_full.bin', V, T); nfull = len(T)
# LOD by clustering
def cluster(cell):
    key, cl = {}, []
    m = []
    for i, p in enumerate(pos):
        main = max(bw[i].items(), key=lambda kv: kv[1])[0]
        k = (int(p[0] // cell), int(p[1] // cell), int(p[2] // cell), main)
        if k not in key: key[k] = len(cl); cl.append([])
        cl[key[k]].append(i); m.append(key[k])
    seen, T2 = set(), []
    for a, b, c in tris:
        t = (m[a], m[b], m[c])
        if len(set(t)) < 3: continue
        k2 = tuple(sorted(t))
        if k2 in seen: continue
        seen.add(k2); T2.append(t)
    return cl, T2
lo, hi = 0.005, 0.2
for _ in range(14):
    mid = (lo + hi) / 2
    cl, T2 = cluster(mid)
    if len(T2) > LOD_TRIS: lo = mid
    else: hi = mid
cl, T2 = cluster(hi)
P2, W2, R2 = [], [], []
for members in cl:
    P2.append([sum(pos[i][k] for i in members) / len(members) for k in range(3)])
    d = {}
    for i in members:
        for j, w in bw[i].items(): d[j] = d.get(j, 0) + w
    W2.append(top4(d))
    votes = {}
    for i in members:
        r = region(i); votes[r] = votes.get(r, 0) + 1
    R2.append(max(votes.items(), key=lambda kv: kv[1])[0])
n2 = normals(P2, T2)
V2 = [dict(p=P2[i], n=n2[i], reg=R2[i], w=W2[i]) for i in range(len(P2))]
eyes(V2, T2, 4, 6)
sz_lod = emit('mesh_lod.bin', V2, T2)
json.dump({'bones': [{'name': b, 'parent': KEEP.index(kept_parent(b)) if kept_parent(b) else -1, 'head': heads[b]} for b in KEEP]},
          open(f'{out}/skel.json', 'w'))
print('full verts', len(V), 'tris', nfull, 'bytes', sz_full, '| lod verts', len(V2), 'tris', len(T2), 'bytes', sz_lod, 'cell', round(hi, 4))
