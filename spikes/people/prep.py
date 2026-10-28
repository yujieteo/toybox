# Spike 2 prep: MakeHuman base mesh + default skeleton + weights (all CC0) -> mesh.bin + skel.json.
# Usage: python3 -I prep.py MHDIR OUTDIR
# Keeps the "body" group, collapses 163 bones to 20, keeps 4 weights per vertex, tags a clothing region per vertex.
import json, struct, sys, os
mh, out = sys.argv[1], sys.argv[2]
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
    return [sum(p[k] for p in ps)/len(ps) for k in range(3)]
def up(b):
    while b not in KEEP and b is not None: b = sk['bones'][b]['parent']
    return b
def kept_parent(b):
    return up(sk['bones'][b]['parent'])
heads = {}
for b in KEEP:
    h = head(b); heads[b] = [h[0]*s, (h[1]-ymin)*s, h[2]*s]
bw = [dict() for _ in pos]
for b, lst in W.items():
    k = up(b) or 'root'
    for vi, w in lst:
        if vi in remap: bw[remap[vi]][KEEP.index(k)] = bw[remap[vi]].get(KEEP.index(k), 0) + w
tris = []
for f in faces:
    f = [remap[i] for i in f]
    for i in range(1, len(f)-1): tris.append((f[0], f[i], f[i+1]))
nrm = [[0,0,0] for _ in pos]
for a, b, c in tris:
    u = [pos[b][k]-pos[a][k] for k in range(3)]; v = [pos[c][k]-pos[a][k] for k in range(3)]
    n = [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]]
    for i in (a, b, c):
        for k in range(3): nrm[i][k] += n[k]
buf = bytearray(struct.pack('<II', len(pos), len(tris)*3))
for i, p in enumerate(pos):
    n = nrm[i]; l = (n[0]**2+n[1]**2+n[2]**2)**.5 or 1
    top = sorted(bw[i].items(), key=lambda kv: -kv[1])[:4]
    while len(top) < 4: top.append((0, 0.0))
    tot = sum(w for _, w in top) or 1
    reg = REGION[KEEP[top[0][0]]]
    buf += struct.pack('<7f', p[0], p[1], p[2], n[0]/l, n[1]/l, n[2]/l, float(reg))
    buf += struct.pack('<4f', *[float(j) for j, _ in top]) + struct.pack('<4f', *[w/tot for _, w in top])
for t in tris: buf += struct.pack('<3H', *t)
open(f'{out}/mesh.bin', 'wb').write(buf)
json.dump({'bones': [{'name': b, 'parent': KEEP.index(kept_parent(b)) if kept_parent(b) else -1, 'head': heads[b]} for b in KEEP]},
          open(f'{out}/skel.json', 'w'))
print('verts', len(pos), 'tris', len(tris), 'bytes', len(buf), 'height', ymax-ymin, 'scale', s)
