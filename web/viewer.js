// The Toybox viewer: loads the Goose engine (WebAssembly), feeds it a scene file, draws the
// text overlays, and handles the camera, picking and per-object edits. The authoring app and
// the hosted viewer use this same module. The canvas must have the id "canvas" (the engine
// finds it by that id).

const POSES = { stand: 0, walk: 1, run: 2, wave: 3, point: 4, cheer: 5, sit: 6, bend: 7 };
const LOOKS = { day: 0, dusk: 1, night: 2, indoor: 3 };
const EASE = { linear: 0, inout: 1, step: 2 };
const GROUND = { grass: 0, street: 1, floor: 2, plain: 3, map: 3 };
const FLAG = { hidden: 1, ceiling: 2, wall: 4 };
const PERSON_SIZE = [0.6, 1.7, 0.4];
const OSM_CREDIT = '© OpenStreetMap contributors';
const ONEMAP_CREDIT = 'OneMap © Singapore Land Authority';
const ONEMAP_LOGO = 'https://www.onemap.gov.sg/web-assets/images/logo/om_logo.png';
const SHIRTS = ['#3b5ea8', '#a84b3b', '#4b8a5a', '#c79a2e', '#7a4ea0', '#8a8f96', '#2f7f8f', '#b0507a'];
const PANTS = ['#2b2f4a', '#3a3a3a', '#4a3b2b', '#2f4a3b'];

export function hexRGB(h) {
  const n = parseInt((h || '#808080').slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function loadScript(src) {
  return new Promise((ok, fail) => {
    const s = document.createElement('script');
    s.src = src; s.onload = ok; s.onerror = () => fail(new Error('cannot load ' + src));
    document.head.appendChild(s);
  });
}

export async function createViewer(opts) {
  const { canvas, overlay, engineUrl = 'engine/toybox.js', assetsUrl = 'assets' } = opts;
  await loadScript(engineUrl);
  const M = await ToyboxModule({ locateFile: f => engineUrl.replace(/[^/]*$/, '') + f });
  let W = opts.width || 1280, H = opts.height || 720;
  M._scene_init(W, H);
  const octx = overlay ? overlay.getContext('2d') : null;

  // ---- assets: people meshes and the catalogue
  const up = () => M._toybox_up_buf();
  {
    const sk = await (await fetch(`${assetsUrl}/people/skel.json`)).json();
    sk.bones.forEach((b, i) => M._skel_set(i, b.parent, b.head[0], b.head[1], b.head[2]));
    for (const [id, f] of [[0, 'mesh_full.bin'], [1, 'mesh_lod.bin']]) {
      const buf = new Uint8Array(await (await fetch(`${assetsUrl}/people/${f}`)).arrayBuffer());
      const nv = new Uint32Array(buf.buffer, 0, 2);
      M.HEAPU8.set(buf.subarray(8), up());
      M._toybox_load_skin(id, nv[0], nv[1]);
    }
  }
  const catalogue = await (await fetch(`${assetsUrl}/catalogue.json`)).json();
  const models = new Map(catalogue.models.map(m => [m.id, m]));

  const v = {
    M, catalogue, models, scene: null, t: 0, playing: false, selected: null,
    userCam: false, orbit: { yaw: 0, pitch: 0.4, dist: 12, tx: 0, ty: 1, tz: 0 },
    showOverlay: true, undo: [], onchange: null, onframe: null,
    rootIds: new Map(),   // object id -> engine id
    mapImage: null, logo: null,
  };

  v.size = () => [W, H];
  v.resize = (w, h) => {
    W = w; H = h; M._scene_resize(w, h);
    if (overlay) { overlay.width = w; overlay.height = h; }
  };

  // ---- build the engine scene from the scene file
  const flagsOf = o => (o.hidden ? FLAG.hidden : 0) | ((o.tags || []).includes('ceiling') ? FLAG.ceiling : 0) | ((o.tags || []).includes('wall') ? FLAG.wall : 0);
  function add(prim, mesh, parent, flags, variant, pose, flip, at, yaw, rot, sc, c1, c2, shadow) {
    return M._obj_add(prim, mesh, parent, flags, variant, pose, flip ? 1 : 0, at[0], at[1], at[2], yaw, rot[0], rot[1], rot[2],
      sc[0], sc[1], sc[2], c1[0], c1[1], c1[2], c2[0], c2[1], c2[2], shadow);
  }
  function sizeOf(o) { return o.model === 'person' ? PERSON_SIZE : (models.get(o.model) || {}).size || [1, 1, 1]; }
  v.sizeOf = sizeOf;

  v.load = (scene, keepTime = true) => {
    v.scene = scene;
    if (!keepTime) v.t = 0;
    M._scene_reset();
    v.rootIds.clear();
    const bd = scene.backdrop || {};
    const bc = hexRGB(bd.color || '#9fb88c');
    M._set_backdrop(GROUND[bd.ground || 'grass'] ?? 0, (bd.size || [80, 80])[0], (bd.size || [80, 80])[1], bc[0], bc[1], bc[2]);
    M._set_cutaway(scene.cutaway && scene.cutaway.ceilings ? 1 : 0, scene.cutaway && scene.cutaway.nearWalls ? 1 : 0);
    const done = new Set();
    const addObj = o => {
      if (done.has(o.id)) return;
      done.add(o.id);
      let parent = -1;
      if (o.parent) {
        const po = scene.objects.find(x => x.id === o.parent);
        if (po) { addObj(po); parent = v.rootIds.get(po.id) ?? -1; }
      }
      const at = o.at || [0, 0, 0], sc = o.scale ? (Array.isArray(o.scale) ? o.scale : [o.scale, o.scale, o.scale]) : [1, 1, 1];
      const flags = flagsOf(o);
      const structural = (o.tags || []).some(t => t === 'wall' || t === 'floor' || t === 'ceiling');
      if (o.model === 'person') {
        const n = o.variant || 0;
        const col = o.colors || {};
        const id = add(4, 0, parent, flags, n, POSES[o.pose || 'stand'] ?? 0, o.flip, at, o.yaw || 0, [0, 0, 0], sc,
          hexRGB(col.shirt || SHIRTS[n % SHIRTS.length]), hexRGB(col.pants || PANTS[n % PANTS.length]), 0.32);
        v.rootIds.set(o.id, id);
        return;
      }
      const m = models.get(o.model);
      if (!m) return;
      const shadow = structural || ['road', 'building'].includes(m.kind) ? 0 : 0.45 * Math.max(m.size[0], m.size[2]);
      const root = add(6, 0, parent, flags, 0, 0, o.flip, at, o.yaw || 0, [0, 0, 0], sc, [0, 0, 0], [0, 0, 0], shadow);
      v.rootIds.set(o.id, root);
      for (const p of m.parts) {
        const c = hexRGB((o.colors && p.slot && o.colors[p.slot]) || p.color);
        const prim = { box: 0, cylinder: 1, sphere: 2, wedge: 3 }[p.prim] ?? 0;
        add(prim, 0, root, flags, 0, 0, false, p.pos, 0, p.rot || [0, 0, 0], p.size, c, [0, 0, 0], 0);
      }
    };
    scene.objects.forEach(addObj);
    for (const tr of scene.tracks || []) {
      const id = v.rootIds.get(tr.object);
      if (id === undefined || !tr.keys.length) continue;
      const ch = { at: 0, yaw: 1, scale: 2, pose: 3 }[tr.channel];
      if (ch === undefined) continue;
      M._trk_begin(id, ch);
      for (const k of tr.keys) {
        let a = 0, b = 0, c = 0;
        if (ch === 0) [a, b, c] = k.v;
        else if (ch === 1) a = k.v;
        else if (ch === 2) [a, b, c] = Array.isArray(k.v) ? k.v : [k.v, k.v, k.v];
        else a = POSES[k.v] ?? 0;
        M._key_add(k.t, a, b, c, ch === 3 ? 2 : (EASE[k.ease] ?? 0));
      }
    }
    for (const c of scene.camera || []) M._cam_add(c.t, c.eye[0], c.eye[1], c.eye[2], c.target[0], c.target[1], c.target[2], c.fov || 50, EASE[c.ease] ?? 1);
    const looks = scene.lighting && scene.lighting.length ? scene.lighting : [{ t: 0, look: bd.ground === 'floor' ? 'indoor' : 'day' }];
    for (const l of looks) M._light_add(l.t, LOOKS[l.look] ?? 0);
    buildMap(scene);
    v.draw(v.t);
    if (v.onchange) v.onchange('load');
  };

  // ---- map: OSM footprints extruded, OneMap tiles live
  function ear(poly) {  // simple ear clipping, poly = [[x,z],...], returns triangles of indices
    const n = poly.length, idx = [...Array(n).keys()], tris = [];
    let area = 0;
    for (let i = 0; i < n; i++) { const [x1, z1] = poly[i], [x2, z2] = poly[(i + 1) % n]; area += x1 * z2 - x2 * z1; }
    if (area < 0) idx.reverse();
    const cross = (a, b, c) => (poly[b][0] - poly[a][0]) * (poly[c][1] - poly[a][1]) - (poly[b][1] - poly[a][1]) * (poly[c][0] - poly[a][0]);
    const inside = (p, a, b, c) => cross(a, b, p) >= 0 && cross(b, c, p) >= 0 && cross(c, a, p) >= 0;
    let guard = 0;
    while (idx.length > 3 && guard++ < 5000) {
      let cut = false;
      for (let i = 0; i < idx.length; i++) {
        const a = idx[(i + idx.length - 1) % idx.length], b = idx[i], c = idx[(i + 1) % idx.length];
        if (cross(a, b, c) <= 0) continue;
        if (idx.some(p => p !== a && p !== b && p !== c && inside(p, a, b, c))) continue;
        tris.push([a, b, c]); idx.splice(i, 1); cut = true; break;
      }
      if (!cut) break;
    }
    if (idx.length === 3) tris.push([idx[0], idx[1], idx[2]]);
    return tris;
  }
  function extrude(b, out) {
    const p = b.poly.slice(); if (p.length > 1 && p[0][0] === p[p.length - 1][0] && p[0][1] === p[p.length - 1][1]) p.pop();
    if (p.length < 3) return;
    const h = b.height || 9;
    let area = 0;
    for (let i = 0; i < p.length; i++) { const [x1, z1] = p[i], [x2, z2] = p[(i + 1) % p.length]; area += x1 * z2 - x2 * z1; }
    const q = area < 0 ? p.slice().reverse() : p;     // counter-clockwise seen from +y with z south
    for (let i = 0; i < q.length; i++) {
      const [x1, z1] = q[i], [x2, z2] = q[(i + 1) % q.length];
      const dx = x2 - x1, dz = z2 - z1, l = Math.hypot(dx, dz) || 1, nx = dz / l, nz = -dx / l;
      const v4 = [[x1, 0, z1], [x2, 0, z2], [x2, h, z2], [x1, h, z1]];
      for (const k of [0, 2, 1, 0, 3, 2]) out.push(...v4[k], nx, 0, nz);
    }
    for (const [a, c, d] of ear(q)) for (const k of [a, d, c]) out.push(q[k][0], h, q[k][1], 0, 1, 0);
  }
  function buildMap(scene) {
    const map = scene.map;
    M._ground_map(0, 0, 0, 0, 0);
    if (!map) return;
    if (map.osm && map.osm.buildings && map.osm.buildings.length) {
      const palette = [[0.86, 0.80, 0.70], [0.78, 0.80, 0.82], [0.84, 0.68, 0.58]];
      const groups = [[], [], []];
      map.osm.buildings.forEach((b, i) => extrude(b, groups[i % 3]));
      groups.forEach((g, gi) => {
        if (!g.length || g.length * 4 > M._toybox_up_size()) return;
        M.HEAPF32.set(new Float32Array(g), up() >> 2);
        const mesh = 8 + gi;
        M._toybox_mesh_upload(mesh, g.length);
        const id = add(5, mesh, -1, 0, 0, 0, false, [0, 0, 0], 0, [0, 0, 0], [1, 1, 1], palette[gi], [0, 0, 0], 0);
        v.rootIds.set('__osm' + gi, id);
      });
    }
    if (map.onemap && map.origin) loadTiles(map);
  }
  const mercator = (lat, lon, z) => {
    const n = 2 ** z, x = (lon + 180) / 360 * n, s = Math.sin(lat * Math.PI / 180);
    return [x, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n];
  };
  async function loadTiles(map) {
    const z = map.onemap.zoom || 18, style = map.onemap.style || 'Default', o = map.origin;
    const [fx, fy] = mercator(o.lat, o.lon, z), cx = Math.floor(fx), cy = Math.floor(fy), R = 1;
    const mPerTile = 156543.03392 * Math.cos(o.lat * Math.PI / 180) / 2 ** z * 256;
    const cv = document.createElement('canvas'); cv.width = cv.height = 256 * (2 * R + 1);
    const g = cv.getContext('2d');
    let any = false;
    await Promise.all([...Array(2 * R + 1).keys()].flatMap(i => [...Array(2 * R + 1).keys()].map(j => new Promise(done => {
      const im = new Image(); im.crossOrigin = 'anonymous';
      im.onload = () => { g.drawImage(im, i * 256, j * 256); any = true; done(); };
      im.onerror = () => done();
      im.src = `https://www.onemap.gov.sg/maps/tiles/${style}/${z}/${cx - R + i}/${cy - R + j}.png`;
    }))));
    if (!any) return;
    try {
      const d = g.getImageData(0, 0, cv.width, cv.height);
      M.HEAPU8.set(d.data, up());
      M._toybox_ground_upload(cv.width, cv.height);
    } catch (e) { return; }   // a tainted canvas: the tiles stay off
    // metres from the origin: x east, z south
    const x0 = ((cx - R) - fx) * mPerTile, x1 = ((cx + R + 1) - fx) * mPerTile;
    const z0 = ((cy - R) - fy) * mPerTile, z1 = ((cy + R + 1) - fy) * mPerTile;
    M._ground_map(1, x0, z0, x1, z1);
    v.mapImage = true;
  }
  v.loadLogo = () => new Promise(done => {
    const im = new Image(); im.crossOrigin = 'anonymous';
    im.onload = () => { v.logo = im; done(); }; im.onerror = () => done(); im.src = ONEMAP_LOGO;
  });

  // ---- drawing
  v.project = (x, y, z) => (M._project(x, y, z) ? [M._proj_x(), M._proj_y()] : null);
  v.draw = (t) => {
    v.t = t;
    if (v.userCam) { const o = v.orbit; M._cam_user(1, o.yaw, o.pitch, o.dist, o.tx, o.ty, o.tz); } else M._cam_user(0, 0, 0, 0, 0, 0, 0);
    M._render_frame(t);
    if (octx) { octx.clearRect(0, 0, W, H); if (v.showOverlay) drawOverlay(octx, W, H, t); }
    if (v.onframe) v.onframe(t);
  };

  function wrap(ctx, text, maxW) {
    const words = text.split(/\s+/), lines = []; let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
    }
    if (line) lines.push(line);
    return lines;
  }
  function pill(ctx, x, y, w, h, r, fill) {
    ctx.fillStyle = fill; ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill();
  }
  const FONT = '"DM Sans", system-ui, sans-serif';
  // The text at least 4 percent of the frame height; white on a dark box (contrast above 4.5 to 1).
  function drawOverlay(ctx, w, h, t) {
    const sc = v.scene; if (!sc) return;
    const fs = Math.round(h * 0.045);
    // sign labels
    for (const o of sc.objects) {
      const m = models.get(o.model);
      if (!m || m.kind !== 'sign' || !o.label) continue;
      const id = v.rootIds.get(o.id); if (id === undefined) continue;
      const p = v.project(M._obj_wx(id), M._obj_wy(id) + m.size[1] * 0.6, M._obj_wz(id));
      if (!p) continue;
      const dist = Math.hypot(M._obj_wx(id) - M._cam_x(), M._obj_wy(id) - M._cam_y(), M._obj_wz(id) - M._cam_z());
      const s = Math.max(h * 0.02, Math.min(h * 0.05, h * 1.6 / dist));
      ctx.font = `600 ${s}px ${FONT}`;
      const tw = ctx.measureText(o.label).width;
      pill(ctx, p[0] - tw / 2 - s * 0.4, p[1] - s * 0.8, tw + s * 0.8, s * 1.4, s * 0.3, 'rgba(255,255,255,0.92)');
      ctx.fillStyle = '#1c1b18'; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
      ctx.fillText(o.label, p[0], p[1] - s * 0.1);
    }
    // callouts
    for (const c of sc.callouts || []) {
      if (t < c.start || t >= c.end) continue;
      let pos = c.at;
      if (c.object) { const id = v.rootIds.get(c.object); if (id === undefined) continue; pos = [M._obj_wx(id), M._obj_wy(id) + (sizeOf(sc.objects.find(o => o.id === c.object) || {})[1] || 1.7), M._obj_wz(id)]; }
      if (!pos) continue;
      const p = v.project(pos[0], pos[1], pos[2]); if (!p) continue;
      const s = Math.round(h * 0.04);
      ctx.font = `500 ${s}px ${FONT}`;
      const lines = wrap(ctx, c.text, w * 0.28), lh = s * 1.25;
      const bw = Math.max(...lines.map(l => ctx.measureText(l).width)) + s, bh = lines.length * lh + s * 0.6;
      const x = Math.min(w - bw - 8, Math.max(8, p[0] - bw / 2)), y = Math.max(8, p[1] - bh - s * 1.2);
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = Math.max(2, h / 540);
      ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(p[0], y + bh); ctx.stroke();
      pill(ctx, x, y, bw, bh, s * 0.35, 'rgba(20,20,20,0.82)');
      ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      lines.forEach((l, i) => ctx.fillText(l, x + s * 0.5, y + s * 0.3 + i * lh));
    }
    // chapter title and clock
    const ch = (sc.chapters || []).find(c => t >= c.start && t < c.end);
    if (ch && (ch.clock || ch.title)) {
      const s = Math.round(h * 0.042);
      ctx.font = `600 ${s}px ${FONT}`;
      const txt = [ch.clock, ch.title].filter(Boolean).join('  ·  ');
      const tw = ctx.measureText(txt).width;
      pill(ctx, h * 0.02, h * 0.02, tw + s, s * 1.6, s * 0.4, 'rgba(20,20,20,0.82)');
      ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(txt, h * 0.02 + s * 0.5, h * 0.02 + s * 0.8);
    }
    // captions
    const caps = (sc.captions || []).filter(c => t >= c.start && t < c.end);
    if (caps.length) {
      ctx.font = `500 ${fs}px ${FONT}`;
      const lines = wrap(ctx, caps.map(c => c.text).join(' '), w * 0.82), lh = fs * 1.25;
      const bw = Math.max(...lines.map(l => ctx.measureText(l).width)) + fs, bh = lines.length * lh + fs * 0.5;
      const x = (w - bw) / 2, y = h - bh - h * 0.05;
      pill(ctx, x, y, bw, bh, fs * 0.35, 'rgba(20,20,20,0.82)');
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      lines.forEach((l, i) => ctx.fillText(l, w / 2, y + fs * 0.25 + i * lh));
    }
    // credits
    const credits = [...(sc.credits || [])];
    if (sc.map && sc.map.osm && sc.map.osm.buildings && sc.map.osm.buildings.length) credits.push(OSM_CREDIT);
    if (sc.map && sc.map.onemap && v.mapImage) credits.push(ONEMAP_CREDIT);
    if (credits.length) {
      const s = Math.round(h * 0.022);
      ctx.font = `400 ${s}px ${FONT}`; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
      let y = h - h * 0.01;
      for (const c of credits.reverse()) {
        const tw = ctx.measureText(c).width;
        pill(ctx, w - tw - s * 1.2, y - s * 1.3, tw + s, s * 1.25, s * 0.25, 'rgba(20,20,20,0.6)');
        ctx.fillStyle = '#fff'; ctx.fillText(c, w - s * 0.7, y - s * 0.15); y -= s * 1.4;
      }
      if (v.logo && sc.map && sc.map.onemap) ctx.drawImage(v.logo, w - s * 5.5, y - s * 1.8, s * 5, s * 1.8);
    }
    // selection box
    if (v.selected && !v.exporting) {
      const b = screenBox(v.selected);
      if (b) { ctx.strokeStyle = '#e0805c'; ctx.lineWidth = Math.max(2, h / 360); ctx.setLineDash([8, 6]); ctx.strokeRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0); ctx.setLineDash([]); }
    }
  }
  v.drawOverlay = drawOverlay;

  // ---- camera control
  v.camState = () => ({ eye: [M._cam_x(), M._cam_y(), M._cam_z()] });
  function ensureUserCam() {
    if (v.userCam) return;
    // start from the story camera: look from the current eye at a point on the ground ahead
    const e = [M._cam_x(), M._cam_y(), M._cam_z()];
    const cam = (v.scene.camera || []).length ? v.scene.camera[0] : { target: [0, 1, 0] };
    const tg = cam.target;
    const dx = e[0] - tg[0], dy = e[1] - tg[1], dz = e[2] - tg[2];
    const d = Math.hypot(dx, dy, dz) || 10;
    v.orbit = { yaw: Math.atan2(dx, dz), pitch: Math.asin(Math.max(-1, Math.min(1, dy / d))), dist: d, tx: tg[0], ty: tg[1], tz: tg[2] };
    v.userCam = true;
  }
  v.orbitBy = (dyaw, dpitch) => { ensureUserCam(); const o = v.orbit; o.yaw -= dyaw; o.pitch = Math.max(-0.2, Math.min(1.5, o.pitch + dpitch)); v.draw(v.t); };
  v.zoomBy = (f) => { ensureUserCam(); const o = v.orbit; o.dist = Math.max(1.5, Math.min(300, o.dist * f)); v.draw(v.t); };
  v.panBy = (dx, dy) => {
    ensureUserCam(); const o = v.orbit, k = o.dist * 0.0012;
    o.tx -= (Math.cos(o.yaw) * dx + Math.sin(o.yaw) * dy * Math.sin(o.pitch)) * k;
    o.tz -= (-Math.sin(o.yaw) * dx + Math.cos(o.yaw) * dy * Math.sin(o.pitch)) * k;
    v.draw(v.t);
  };
  v.storyCamera = () => { v.userCam = false; v.draw(v.t); };

  // ---- picking and edits
  function bbox(o) {
    const id = v.rootIds.get(o.id); if (id === undefined) return null;
    const s = sizeOf(o), sc = o.scale ? (Array.isArray(o.scale) ? o.scale : [o.scale, o.scale, o.scale]) : [1, 1, 1];
    const hw = s[0] * sc[0] / 2, hd = s[2] * sc[2] / 2, hh = s[1] * sc[1];
    const yaw = (o.yaw || 0) * Math.PI / 180, c = Math.cos(yaw), sn = Math.sin(yaw);
    const cx = M._obj_wx(id), cy = M._obj_wy(id), cz = M._obj_wz(id);
    const pts = [];
    for (const x of [-hw, hw]) for (const z of [-hd, hd]) for (const y of [0, hh]) pts.push([cx + x * c + z * sn, cy + y, cz - x * sn + z * c]);
    return pts;
  }
  function screenBox(id) {
    const o = v.scene.objects.find(x => x.id === id); if (!o) return null;
    const pts = bbox(o); if (!pts) return null;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, n = 0;
    for (const p of pts) { const q = v.project(p[0], p[1], p[2]); if (!q) continue; n++; x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); }
    return n ? { x0, y0, x1, y1 } : null;
  }
  v.pick = (px, py) => {   // px, py in canvas pixels
    let best = null, area = 1e18;
    for (const o of v.scene.objects) {
      if (o.parent || (o.tags || []).includes('floor') || (o.tags || []).includes('ceiling')) continue;
      const b = screenBox(o.id); if (!b) continue;
      if (px >= b.x0 && px <= b.x1 && py >= b.y0 && py <= b.y1) { const a = (b.x1 - b.x0) * (b.y1 - b.y0); if (a < area) { area = a; best = o.id; } }
    }
    return best;
  };
  v.select = (id) => { v.selected = id; v.draw(v.t); if (v.onchange) v.onchange('select'); };
  v.groundPoint = (px, py) => {   // ray through the pixel, hit on the plane y = 0
    const e = [M._cam_x(), M._cam_y(), M._cam_z()];
    const t = v.userCam ? [v.orbit.tx, v.orbit.ty, v.orbit.tz] : ((v.scene.camera || [{ target: [0, 1, 0] }])[0].target);
    let f = [t[0] - e[0], t[1] - e[1], t[2] - e[2]]; const fl = Math.hypot(...f); f = f.map(x => x / fl);
    let s = [-f[2], 0, f[0]]; const sl = Math.hypot(...s) || 1; s = s.map(x => x / sl);
    const u = [s[1] * f[2] - s[2] * f[1], s[2] * f[0] - s[0] * f[2], s[0] * f[1] - s[1] * f[0]];
    const tn = Math.tan(50 * Math.PI / 360), nx = (px / W * 2 - 1) * tn * W / H, ny = (1 - py / H * 2) * tn;
    const d = [f[0] + s[0] * nx + u[0] * ny, f[1] + s[1] * nx + u[1] * ny, f[2] + s[2] * nx + u[2] * ny];
    if (Math.abs(d[1]) < 1e-4) return null;
    const k = -e[1] / d[1]; if (k < 0) return null;
    return [e[0] + d[0] * k, 0, e[2] + d[2] * k];
  };
  const snapshot = () => { v.undo.push(JSON.stringify(v.scene)); if (v.undo.length > 20) v.undo.shift(); };
  v.undoEdit = () => { const s = v.undo.pop(); if (s) { v.load(JSON.parse(s)); if (v.onedit) v.onedit(); } };
  const objOf = id => v.scene.objects.find(o => o.id === id);
  v.edit = (op, arg) => {
    const o = objOf(v.selected); if (!o) return;
    snapshot();
    const sc = Array.isArray(o.scale) ? o.scale : o.scale ? [o.scale, o.scale, o.scale] : [1, 1, 1];
    if (op === 'move') {
      const [dx, dz] = arg;
      o.at = [o.at[0] + dx, o.at[1], o.at[2] + dz];
      for (const tr of v.scene.tracks || []) if (tr.object === o.id && tr.channel === 'at') for (const k of tr.keys) k.v = [k.v[0] + dx, k.v[1], k.v[2] + dz];
    }
    if (op === 'scale') o.scale = sc.map(x => +(x * arg).toFixed(4));
    if (op === 'rotate') o.yaw = (((o.yaw || 0) + arg) % 360 + 360) % 360;
    if (op === 'flip') o.flip = !o.flip;
    if (op === 'duplicate') {
      const c = JSON.parse(JSON.stringify(o)); let n = 2; while (objOf(`${o.id}-${n}`)) n++;
      c.id = `${o.id}-${n}`; c.at = [o.at[0] + 1, o.at[1], o.at[2] + 1];
      v.scene.objects.push(c); v.selected = c.id;
    }
    if (op === 'delete') {
      v.scene.objects = v.scene.objects.filter(x => x.id !== o.id && x.parent !== o.id);
      v.scene.tracks = (v.scene.tracks || []).filter(tr => tr.object !== o.id);
      v.selected = null;
    }
    v.load(v.scene);
    if (v.onedit) v.onedit();
  };
  v.moveSelectedTo = (gx, gz) => {
    const o = objOf(v.selected); if (!o) return;
    v.edit('move', [gx - o.at[0], gz - o.at[2]]);
  };

  // ---- playback
  let last = 0;
  const tick = (now) => {
    if (!v.playing) return;
    const dt = (now - last) / 1000; last = now;
    const dur = v.scene && v.scene.duration ? v.scene.duration : 60;
    let t = v.t + dt;
    if (t >= dur) { t = dur; v.playing = false; if (v.onchange) v.onchange('end'); }
    v.draw(t);
    if (v.playing) requestAnimationFrame(tick);
  };
  v.play = () => { if (v.playing) return; if (v.scene && v.t >= (v.scene.duration || 60)) v.t = 0; v.playing = true; last = performance.now(); if (v.onchange) v.onchange('play'); requestAnimationFrame(tick); };
  v.pause = () => { v.playing = false; if (v.onchange) v.onchange('pause'); };
  v.seek = (t) => { v.draw(Math.max(0, Math.min(t, v.scene.duration || 60))); };
  v.download = () => {
    const blob = new Blob([JSON.stringify(v.scene, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = (v.scene.title || 'scene').replace(/[^\w-]+/g, '-').toLowerCase() + '.toybox.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  v.readPixels = () => { const p = M._toybox_read_pixels(); return M.HEAPU8.subarray(p, p + W * H * 4); };
  return v;
}
