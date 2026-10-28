// Generator for assets/catalogue.json: the Toybox kit, built from box, cylinder, sphere and wedge.
// Run: node core/kit.mjs   (writes assets/catalogue.json)
// It also adds the imported CC0 models in assets/models/index.json (made by tools/assets/import.mjs).
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { modelBounds } from './geom.mjs';

const LICENSE = 'CC0 (Toybox kit)';
const C = {
  ink: '#3a3f47', glass: '#8fb0c4', tyre: '#2c2f34', white: '#ece8df', red: '#b5483c', blue: '#4a79a5', navy: '#2f4a6b',
  yellow: '#d9b44a', green: '#6f9a6a', darkgreen: '#4f7a52', concrete: '#bdb7ab', asphalt: '#5d6168', line: '#e7e2d3',
  wood: '#a67c52', cream: '#e8dcc0', teal: '#5f9ea0', pink: '#d9a5a0', sand: '#d8c6a0', steel: '#9aa1a8', dark: '#4a4f57',
  char: '#2e2b2a', ash: '#4b4644', orange: '#d98a3d', grey: '#a9a9a4', brick: '#b8765f', sage: '#9db89a', lilac: '#a99bb8',
  floor: '#cfc7b6', ceil: '#f0ece2', wall: '#e6e0d2', carpet: '#7c8aa5',
};
const r = (v) => Math.round(v * 1000) / 1000;
const part = (prim, pos, size, color, slot, rot) => {
  const p = { prim, pos: pos.map(r), size: size.map(r), rot: rot || [0, 0, 0], color };
  if (slot) p.slot = slot;
  return p;
};
const box = (pos, size, color, slot, rot) => part('box', pos, size, color, slot, rot);
const cyl = (pos, size, color, slot, rot) => part('cylinder', pos, size, color, slot, rot);
const sph = (pos, size, color, slot) => part('sphere', pos, size, color, slot);
const wed = (pos, size, color, slot, rot) => part('wedge', pos, size, color, slot, rot);

function wheels(xs, zs, d, w, y = d / 2) {
  const out = [];
  for (const x of xs) for (const z of zs) out.push(cyl([x, y, z], [d, w, d], C.tyre, 'tyre', [0, 0, 90]));
  return out;
}

function car({ body = C.red, roof = null, len = 4.6, w = 1.8, extra = [] }) {
  const hw = w / 2;
  return [
    box([0, 0.55, 0], [w, 0.6, len], body, 'body'),
    box([0, 1.125, -0.2], [w - 0.25, 0.55, len * 0.52], roof || body, 'body'),
    box([0, 1.15, -0.2], [w - 0.22, 0.4, len * 0.52 - 0.2], C.glass, 'glass'),
    box([0, 1.43, -0.2], [w - 0.3, 0.08, len * 0.5], roof || body, 'body'),
    box([hw - 0.3, 0.6, len / 2 + 0.01], [0.3, 0.14, 0.04], C.yellow),
    box([-hw + 0.3, 0.6, len / 2 + 0.01], [0.3, 0.14, 0.04], C.yellow),
    box([0, 0.35, 0], [w - 0.1, 0.1, len - 0.2], C.dark),
    ...wheels([-hw + 0.1, hw - 0.1], [len / 2 - 0.9, -len / 2 + 0.9], 0.64, 0.22),
    ...extra,
  ];
}

function bus({ len, w, h, body, stripe, roofColor, wheelZ }) {
  const hw = w / 2;
  return [
    box([0, 0.35 + (h - 0.35) / 2, 0], [w, h - 0.35, len], body, 'body'),
    box([0, h * 0.62, 0], [w + 0.02, h * 0.28, len - 0.8], C.glass, 'glass'),
    box([0, h * 0.62, len / 2 - 0.35], [w - 0.3, h * 0.3, 0.1], C.glass, 'glass'),
    box([0, 0.55, 0], [w + 0.02, 0.22, len - 0.3], stripe, 'stripe'),
    box([0, h - 0.04, 0], [w - 0.2, 0.08, len - 0.4], roofColor, 'roof'),
    box([hw + 0.01, 1.2, len / 2 - 2.2], [0.04, 1.9, 1.1], C.dark),
    box([0, 0.28, 0], [w - 0.1, 0.2, len - 0.4], C.dark),
    ...wheels([-hw + 0.12, hw - 0.12], wheelZ, 1.0, 0.3),
  ];
}

const models = [];
const add = (id, name, kind, parts, tags = []) => models.push({ id, name, kind, parts, tags });

// ---- vehicles
add('car-sedan', 'Sedan', 'vehicle', car({ body: C.blue }), ['car', 'vehicle']);
add('car-taxi', 'Taxi', 'vehicle', car({ body: C.yellow, extra: [box([0, 1.55, -0.2], [0.7, 0.18, 0.25], C.white, 'sign')] }), ['car', 'taxi']);
add('car-police', 'Police car', 'vehicle', car({ body: C.white, roof: C.white, extra: [
  box([0, 0.8, 0], [1.82, 0.14, 4.4], C.navy, 'stripe'),
  box([-0.25, 1.52, -0.2], [0.4, 0.14, 0.25], C.red, 'light'), box([0.25, 1.52, -0.2], [0.4, 0.14, 0.25], C.blue, 'light')] }), ['car', 'police']);
function ambulance(body, stripe, burnt) {
  const w = 2.1, len = 5.8;
  return [
    box([0, 1.45, -0.5], [w, 1.75, len - 1.3], body, 'body'),
    box([0, 1.0, 2.15], [w, 1.0, 1.5], body, 'body'),
    box([0, 1.55, 2.25], [w - 0.2, 0.7, 1.2], C.glass, 'glass'),
    box([0, 1.2, -0.5], [w + 0.02, 0.35, len - 1.3], stripe, 'stripe'),
    box([0, 2.4, 1.2], [1.2, 0.14, 0.3], burnt ? C.ash : C.red, 'light'),
    box([0, 0.4, 0], [w - 0.1, 0.12, len - 0.2], C.dark),
    ...wheels([-0.95, 0.95], [1.9, -1.9], 0.8, 0.26),
  ];
}
add('ambulance-scdf', 'SCDF ambulance', 'vehicle', ambulance(C.red, C.white, false), ['ambulance', 'scdf']);
add('bus-public', 'Public bus', 'vehicle', bus({ len: 12, w: 2.5, h: 3.2, body: C.white, stripe: C.red, roofColor: C.concrete, wheelZ: [3.8, -3.8] }), ['bus']);
add('bus-private', 'Private bus', 'vehicle', bus({ len: 10, w: 2.4, h: 3.1, body: C.cream, stripe: C.teal, roofColor: C.white, wheelZ: [3.2, -3.2] }), ['bus', 'private']);
add('lorry', 'Lorry', 'vehicle', [
  box([0, 1.1, 2.6], [2.3, 1.9, 1.7], C.green, 'body'), box([0, 1.7, 3.0], [2.2, 0.7, 0.9], C.glass, 'glass'),
  box([0, 0.55, 0], [2.3, 0.3, 7.5], C.dark), box([0, 1.95, -0.7], [2.4, 2.8, 5.4], C.white, 'cargo'),
  ...wheels([-1.0, 1.0], [2.8, -1.2, -2.6], 0.9, 0.3),
], ['lorry', 'truck']);
add('motorbike', 'Motorbike', 'vehicle', [
  cyl([0, 0.3, 0.7], [0.6, 0.12, 0.6], C.tyre, 'tyre', [0, 0, 90]), cyl([0, 0.3, -0.7], [0.6, 0.14, 0.6], C.tyre, 'tyre', [0, 0, 90]),
  box([0, 0.6, 0], [0.3, 0.35, 1.0], C.red, 'body'), box([0, 0.85, -0.25], [0.28, 0.1, 0.6], C.dark),
  box([0, 1.0, 0.55], [0.7, 0.05, 0.05], C.dark), box([0, 0.75, 0.6], [0.1, 0.5, 0.1], C.steel),
], ['motorbike']);

// Overturned and burnt variants (the format has yaw only, so these are separate models).
function burnt(parts) { return parts.map((p) => ({ ...p, color: p.slot === 'tyre' ? C.tyre : (p.slot === 'glass' ? '#2a2a2c' : C.char), slot: undefined })).map((p) => { if (!p.slot) delete p.slot; return p; }); }
function overturned(parts) { return parts.map((p) => ({ ...p, pos: [-p.pos[0], -p.pos[1], p.pos[2]], rot: [p.rot[0], p.rot[1], p.rot[2] + 180] })); }
const byId = (id) => models.find((m) => m.id === id).parts;
add('car-police-overturned', 'Police car, overturned', 'vehicle', overturned(byId('car-police')), ['police', 'overturned']);
add('car-police-burnt', 'Police car, burnt', 'vehicle', burnt(byId('car-police')), ['police', 'burnt']);
add('ambulance-scdf-overturned', 'SCDF ambulance, overturned', 'vehicle', overturned(byId('ambulance-scdf')), ['ambulance', 'overturned']);
add('ambulance-scdf-burnt', 'SCDF ambulance, burnt', 'vehicle', burnt(byId('ambulance-scdf')), ['ambulance', 'burnt']);
add('flame', 'Flame', 'prop', [
  wed([0, 0.5, 0], [0.7, 1.0, 0.7], C.orange), wed([0.1, 0.4, 0.05], [0.4, 0.8, 0.4], C.yellow, null, [0, 90, 0]),
], ['fire']);

// ---- buildings
function shophouse(storeys, color, trim) {
  const w = 5.5, d = 14, way = 1.5, gh = 3.4, sh = 2.9;
  const H = gh + (storeys - 1) * sh;
  const parts = [
    box([0, gh / 2, -way / 2], [w, gh, d - way], color, 'wall'),                       // ground floor body, recessed
    box([0, gh + (H - gh) / 2, 0], [w, H - gh, d], color, 'wall'),                    // upper floors reach the front
    box([0, 0.05, d / 2 - way / 2], [w, 0.1, way], C.concrete, 'floor'),              // five-foot way deck
    box([-w / 2 + 0.2, gh / 2, d / 2 - 0.2], [0.4, gh, 0.4], trim, 'trim'),           // columns
    box([w / 2 - 0.2, gh / 2, d / 2 - 0.2], [0.4, gh, 0.4], trim, 'trim'),
    box([0, 1.2, d / 2 - way + 0.03], [3.2, 2.2, 0.06], C.glass, 'glass'),            // shop window
    box([-1.9, 1.1, d / 2 - way + 0.04], [0.8, 2.1, 0.06], C.wood, 'door'),           // door
    box([0, gh - 0.3, d / 2 - way + 0.05], [w - 0.3, 0.5, 0.08], C.red, 'sign'),      // fascia sign board
    wed([0, H + 0.9, 0], [w + 0.4, 1.8, d + 0.4], C.brick, 'roof'),
  ];
  for (let s = 1; s < storeys; s++) {
    const y = gh + (s - 1) * sh + sh / 2;
    parts.push(box([-1.2, y, d / 2 + 0.03], [1.0, 1.7, 0.06], C.glass, 'glass'), box([1.2, y, d / 2 + 0.03], [1.0, 1.7, 0.06], C.glass, 'glass'));
    parts.push(box([-1.2, y - 0.9, d / 2 + 0.08], [1.3, 0.1, 0.16], trim, 'trim'), box([1.2, y - 0.9, d / 2 + 0.08], [1.3, 0.1, 0.16], trim, 'trim'));
  }
  return parts;
}
add('shophouse-2', 'Shophouse, 2 storeys', 'building', shophouse(2, C.pink, C.teal), ['shophouse', 'five-foot-way']);
add('shophouse-3', 'Shophouse, 3 storeys', 'building', shophouse(3, C.sand, C.green), ['shophouse', 'five-foot-way']);
add('shopfront-a', 'Shop front, glass', 'building', [
  box([0, 1.5, -0.1], [5, 3, 0.2], C.cream, 'wall'), box([-0.4, 1.1, 0.02], [3.0, 2.0, 0.06], C.glass, 'glass'),
  box([1.8, 1.05, 0.02], [0.9, 2.1, 0.06], C.wood, 'door'), box([0, 2.75, 0.06], [4.8, 0.45, 0.08], C.blue, 'sign'),
], ['shopfront']);
add('shopfront-b', 'Shop front, shutter', 'building', [
  box([0, 1.5, -0.1], [4, 3, 0.2], C.sage, 'wall'), box([0, 1.1, 0.02], [3.2, 2.1, 0.06], C.steel, 'shutter'),
  box([0, 2.7, 0.06], [3.8, 0.5, 0.08], C.yellow, 'sign'),
], ['shopfront']);
const hdb = [box([0, 16.5, 0], [60, 33, 12], C.cream, 'wall'), box([0, 33.3, 0], [60.4, 0.6, 12.4], C.brick, 'roof')];
for (let f = 0; f < 11; f++) hdb.push(box([0, 2 + f * 2.9, 6.02], [58, 1.1, 0.06], C.glass, 'glass'));
hdb.push(box([-27, 16.5, 6.1], [3, 33, 0.2], C.lilac, 'core'), box([27, 16.5, 6.1], [3, 33, 0.2], C.lilac, 'core'));
add('hdb-slab', 'HDB block, slab', 'building', hdb, ['hdb', 'residential']);

// ---- street furniture and roads
add('bus-stop', 'Bus stop', 'structure', [
  box([0, 2.7, 0], [3.5, 0.12, 1.5], C.blue, 'roof'), box([-1.7, 1.35, 0], [0.1, 2.7, 1.4], C.steel), box([1.7, 1.35, 0], [0.1, 2.7, 1.4], C.steel),
  box([0, 1.4, -0.7], [3.3, 2.2, 0.05], C.glass, 'glass'), box([0, 0.45, -0.3], [2.4, 0.08, 0.45], C.wood, 'seat'),
  box([0, 0.2, -0.3], [2.2, 0.4, 0.1], C.dark), box([2.1, 1.3, 0.6], [0.08, 2.6, 0.08], C.steel), box([2.1, 2.3, 0.6], [0.5, 0.45, 0.06], C.red, 'sign'),
], ['bus-stop']);
add('kerb', 'Kerb piece', 'road', [box([0, 0.075, 0], [2, 0.15, 0.3], C.concrete)], ['kerb']);
const roadTile = (w, d, extras) => [box([0, 0.05, 0], [w, 0.1, d], C.asphalt, 'asphalt'), ...extras];
const dashes = []; for (let i = -4; i <= 4; i += 2) dashes.push(box([0, 0.105, i + 0.5], [0.12, 0.012, 1.0], C.line));
add('road-straight', 'Road, straight (2 lanes, along z)', 'road', roadTile(8, 10, dashes), ['road']);
add('road-junction', 'Road, 4-way junction', 'road', roadTile(8, 8, [
  box([0, 0.105, 3.6], [8, 0.012, 0.25], C.line), box([0, 0.105, -3.6], [8, 0.012, 0.25], C.line)]), ['road', 'junction']);
const zebra = []; for (let i = -3.5; i <= 3.5; i += 1) zebra.push(box([i, 0.105, 0], [0.5, 0.012, 3], C.line));
add('road-zebra', 'Road, zebra crossing', 'road', roadTile(8, 3, zebra), ['road', 'crossing']);
add('lamp-post', 'Lamp post', 'prop', [
  cyl([0, 3.5, 0], [0.14, 7, 0.14], C.steel), box([0.6, 7.0, 0], [1.3, 0.1, 0.1], C.steel), box([1.2, 6.9, 0], [0.5, 0.15, 0.25], C.yellow, 'lamp'),
  cyl([0, 0.15, 0], [0.4, 0.3, 0.4], C.dark),
], ['lamp']);
add('traffic-light', 'Traffic light', 'prop', [
  cyl([0, 2.75, 0], [0.14, 5.5, 0.14], C.dark), box([0, 5.2, 0.15], [0.35, 1.0, 0.25], C.dark),
  sph([0, 5.5, 0.3], [0.2, 0.2, 0.2], C.red, 'red'), sph([0, 5.2, 0.3], [0.2, 0.2, 0.2], C.yellow, 'amber'), sph([0, 4.9, 0.3], [0.2, 0.2, 0.2], C.green, 'green'),
], ['traffic']);
add('bin', 'Rubbish bin', 'prop', [cyl([0, 0.45, 0], [0.5, 0.9, 0.5], C.darkgreen, 'body'), cyl([0, 0.92, 0], [0.54, 0.06, 0.54], C.dark)], ['bin']);
add('bin-recycling', 'Recycling bin', 'prop', [box([0, 0.5, 0], [0.7, 1.0, 0.5], C.blue, 'body'), box([0, 1.03, 0], [0.72, 0.06, 0.52], C.dark)], ['bin']);
add('barrier', 'Crowd barrier', 'prop', [
  box([0, 0.95, 0], [2.2, 0.08, 0.06], C.steel), box([0, 0.55, 0], [2.2, 0.08, 0.06], C.steel), box([0, 0.25, 0], [2.2, 0.08, 0.06], C.steel),
  box([-1.05, 0.5, 0], [0.06, 1.0, 0.5], C.steel), box([1.05, 0.5, 0], [0.06, 1.0, 0.5], C.steel), box([0, 0.7, 0], [2.0, 0.4, 0.02], C.yellow, 'panel'),
], ['barrier']);
add('cone', 'Traffic cone', 'prop', [
  box([0, 0.025, 0], [0.4, 0.05, 0.4], C.dark), cyl([0, 0.2, 0], [0.32, 0.3, 0.32], C.orange, 'body'),
  cyl([0, 0.45, 0], [0.2, 0.3, 0.2], C.orange, 'body'), cyl([0, 0.66, 0], [0.1, 0.1, 0.1], C.orange, 'body'), cyl([0, 0.4, 0], [0.24, 0.06, 0.24], C.white),
], ['cone']);
add('tree', 'Tree', 'nature', [cyl([0, 1.6, 0], [0.4, 3.2, 0.4], C.wood), sph([0, 4.2, 0], [4, 3.6, 4], C.darkgreen, 'leaf'), sph([0.6, 3.6, 0.5], [2.6, 2.2, 2.6], C.green, 'leaf')], ['tree']);
add('bench', 'Bench', 'prop', [
  box([0, 0.45, 0], [1.6, 0.08, 0.45], C.wood, 'seat'), box([0, 0.75, -0.2], [1.6, 0.4, 0.06], C.wood, 'seat'),
  box([-0.7, 0.22, 0], [0.08, 0.44, 0.4], C.dark), box([0.7, 0.22, 0], [0.08, 0.44, 0.4], C.dark),
], ['bench']);
add('sign', 'Sign (label on the board)', 'sign', [
  cyl([0, 1.2, 0], [0.08, 2.4, 0.08], C.steel), box([0, 2.0, 0.06], [1.2, 0.6, 0.06], C.white, 'board'),
], ['sign', 'label']);
add('sign-large', 'Sign, large board', 'sign', [
  box([-1.2, 1.5, 0], [0.12, 3.0, 0.12], C.steel), box([1.2, 1.5, 0], [0.12, 3.0, 0.12], C.steel), box([0, 2.5, 0.08], [3.0, 1.2, 0.08], C.white, 'board'),
], ['sign', 'label']);

// ---- indoor
add('wall-3', 'Wall segment, 3 m', 'structure', [box([0, 1.4, 0], [3, 2.8, 0.15], C.wall, 'wall')], ['wall']);
add('wall-5', 'Wall segment, 5 m', 'structure', [box([0, 1.4, 0], [5, 2.8, 0.15], C.wall, 'wall')], ['wall']);
add('wall-door-3', 'Wall with door gap, 3 m', 'structure', [
  box([-0.975, 1.4, 0], [1.05, 2.8, 0.15], C.wall, 'wall'), box([0.975, 1.4, 0], [1.05, 2.8, 0.15], C.wall, 'wall'),
  box([0, 2.45, 0], [0.9, 0.7, 0.15], C.wall, 'wall'),
], ['wall', 'door-gap']);
add('door', 'Door', 'structure', [
  box([0, 2.05, 0], [1.05, 0.1, 0.12], C.dark, 'frame'), box([-0.5, 1.0, 0], [0.05, 2.0, 0.12], C.dark, 'frame'), box([0.5, 1.0, 0], [0.05, 2.0, 0.12], C.dark, 'frame'),
  box([0, 1.0, 0], [0.95, 2.0, 0.05], C.wood, 'leaf'), box([0.35, 1.0, 0.04], [0.04, 0.04, 0.08], C.steel),
], ['door']);
add('window', 'Window', 'structure', [
  box([0, 0.6, 0], [1.2, 1.2, 0.05], C.glass, 'glass'), box([0, 0.03, 0], [1.2, 0.06, 0.1], C.dark, 'frame'), box([0, 1.17, 0], [1.2, 0.06, 0.1], C.dark, 'frame'),
  box([-0.57, 0.6, 0], [0.06, 1.2, 0.1], C.dark, 'frame'), box([0.57, 0.6, 0], [0.06, 1.2, 0.1], C.dark, 'frame'), box([0, 0.6, 0], [0.04, 1.2, 0.1], C.dark, 'frame'),
], ['window']);
add('floor-tile', 'Floor tile, 2 m', 'structure', [box([0, 0.01, 0], [2, 0.02, 2], C.floor, 'floor')], ['floor']);
add('ceiling-tile', 'Ceiling tile, 2 m', 'structure', [box([0, 0.025, 0], [2, 0.05, 2], C.ceil, 'ceiling')], ['ceiling']);
function stairs() {
  const parts = [], n = 14, rise = 0.17, run = 0.28, w = 1.2;
  for (let i = 0; i < n; i++) parts.push(box([0, (i + 1) * rise / 2, -n * run / 2 + (i + 0.5) * run], [w, (i + 1) * rise, run], i % 2 ? C.concrete : C.grey, 'step'));
  return parts;
}
add('stairs-14', 'Stairs, flight of 14 steps (rises toward +z)', 'structure', stairs(), ['stairs']);
add('escalator', 'Escalator (rises toward +z)', 'structure', [
  box([0, 1.75, 0], [1.1, 0.3, 7.6], C.steel, 'body', [-30, 0, 0]),
  box([-0.5, 2.25, 0], [0.1, 0.9, 7.6], C.dark, 'rail', [-30, 0, 0]), box([0.5, 2.25, 0], [0.1, 0.9, 7.6], C.dark, 'rail', [-30, 0, 0]),
], ['escalator']);
add('lift-door', 'Lift door', 'structure', [
  box([0, 2.15, 0], [1.4, 0.1, 0.2], C.dark, 'frame'), box([-0.65, 1.05, 0], [0.1, 2.1, 0.2], C.dark, 'frame'), box([0.65, 1.05, 0], [0.1, 2.1, 0.2], C.dark, 'frame'),
  box([-0.3, 1.05, 0], [0.58, 2.1, 0.06], C.steel, 'leaf'), box([0.3, 1.05, 0], [0.58, 2.1, 0.06], C.steel, 'leaf'), box([0.85, 1.1, 0.05], [0.08, 0.2, 0.04], C.yellow),
], ['lift']);
add('reception-desk', 'Reception desk', 'furniture', [
  box([0, 0.55, 0], [3.0, 1.1, 0.7], C.wood, 'body'), box([0, 1.12, 0], [3.1, 0.05, 0.8], C.white, 'top'), box([0, 1.2, -0.1], [0.5, 0.2, 0.05], C.dark),
], ['desk', 'reception']);
add('table', 'Table', 'furniture', [box([0, 0.73, 0], [1.2, 0.04, 0.7], C.wood, 'top'),
  box([-0.55, 0.36, -0.3], [0.05, 0.72, 0.05], C.dark), box([0.55, 0.36, -0.3], [0.05, 0.72, 0.05], C.dark), box([-0.55, 0.36, 0.3], [0.05, 0.72, 0.05], C.dark), box([0.55, 0.36, 0.3], [0.05, 0.72, 0.05], C.dark)], ['table']);
add('chair', 'Chair', 'furniture', [
  box([0, 0.45, 0], [0.45, 0.05, 0.45], C.blue, 'seat'), box([0, 0.7, -0.2], [0.45, 0.45, 0.05], C.blue, 'seat'),
  box([-0.2, 0.22, -0.2], [0.04, 0.44, 0.04], C.dark), box([0.2, 0.22, -0.2], [0.04, 0.44, 0.04], C.dark), box([-0.2, 0.22, 0.2], [0.04, 0.44, 0.04], C.dark), box([0.2, 0.22, 0.2], [0.04, 0.44, 0.04], C.dark),
], ['chair']);
const banq = [cyl([0, 0.73, 0], [1.8, 0.05, 1.8], C.white, 'top'), cyl([0, 0.36, 0], [0.2, 0.72, 0.2], C.dark)];
for (let i = 0; i < 8; i++) {
  const a = i * 45, rad = 1.25, x = Math.sin(a * Math.PI / 180) * rad, z = Math.cos(a * Math.PI / 180) * rad;
  // chair faces the table: its back lies outside
  banq.push(box([x, 0.45, z], [0.45, 0.05, 0.45], C.lilac, 'chair', [0, a, 0]));
  banq.push(box([Math.sin(a * Math.PI / 180) * (rad + 0.2), 0.7, Math.cos(a * Math.PI / 180) * (rad + 0.2)], [0.45, 0.45, 0.05], C.lilac, 'chair', [0, a, 0]));
}
add('banquet-table-8', 'Banquet round table with 8 chairs', 'furniture', banq, ['table', 'banquet']);
add('stage', 'Stage', 'furniture', [
  box([0, 0.4, 0.4], [8, 0.8, 3.2], C.dark, 'deck'), box([0, 0.81, 0.4], [8, 0.02, 3.2], C.wood, 'deck'),
  box([0, 1.8, -1.8], [8, 3.0, 0.2], C.navy, 'backdrop'),
], ['stage']);
add('sofa', 'Sofa', 'furniture', [
  box([0, 0.25, 0], [2.0, 0.5, 0.9], C.teal, 'body'), box([0, 0.65, -0.35], [2.0, 0.4, 0.2], C.teal, 'body'),
  box([-0.9, 0.55, 0], [0.2, 0.3, 0.9], C.teal, 'body'), box([0.9, 0.55, 0], [0.2, 0.3, 0.9], C.teal, 'body'),
], ['sofa']);
add('plant', 'Potted plant', 'furniture', [cyl([0, 0.2, 0], [0.4, 0.4, 0.4], C.brick, 'pot'), sph([0, 0.8, 0], [0.5, 0.8, 0.5], C.green, 'leaf')], ['plant']);
add('notice-board', 'Notice board', 'furniture', [
  box([-0.5, 0.95, 0], [0.06, 1.9, 0.06], C.dark), box([0.5, 0.95, 0], [0.06, 1.9, 0.06], C.dark), box([0, 1.3, 0.02], [1.2, 0.9, 0.05], C.wood, 'frame'),
  box([0, 1.3, 0.05], [1.1, 0.8, 0.02], C.sage, 'board'),
], ['board', 'label']);
add('turnstile', 'Turnstile gate', 'furniture', [
  box([0, 0.5, 0], [0.25, 1.0, 0.9], C.steel, 'body'), box([0.35, 0.95, 0], [0.5, 0.04, 0.04], C.glass, 'arm'), box([0, 1.05, 0], [0.27, 0.08, 0.92], C.dark),
], ['turnstile']);

// ---- outfits: colours and parts that a person wears. A part follows one bone of the body (names in
// assets/people/skel.json). pos and rot are in the rest pose: origin between the feet, facing +z.
const SPF = 'https://en.wikipedia.org/wiki/Uniforms_of_the_Singapore_Police_Force';
const RIOT = 'https://en.wikipedia.org/wiki/2013_Little_India_riot';
const SOC_KIT = 'https://www.hometeamns.sg/frontline/ensuring-safety-security-of-singapore/';
const SOC_DRILL = 'https://www.nas.gov.sg/archivesonline/photographs/record-details/d3115385-1161-11e3-83d5-0050568939ad';
const gear = (bone, prim, pos, size, color, rot) => ({ bone, ...part(prim, pos, size, color, null, rot) });
const helmet = (color) => gear('head', 'sphere', [0, 1.655, 0.01], [0.25, 0.23, 0.27], color);
const outfits = [];
const outfit = (id, name, colors, parts, source, note) => outfits.push({ id, name, colors, parts, source, note });
outfit('police', 'Singapore Police Force officer, dark blue uniform and peak cap', { shirt: '#2b3d5e', pants: '#2b3d5e' }, [
  gear('head', 'cylinder', [0, 1.71, 0.045], [0.22, 0.07, 0.23], '#26324a'), gear('head', 'box', [0, 1.69, 0.17], [0.17, 0.02, 0.07], '#14171c'),
], SPF, 'Dark blue shirt, trousers and peak cap. Colour shades are estimated.');
outfit('police-shield', 'Police officer with helmet and round shield', { shirt: '#2b3d5e', pants: '#2b3d5e' }, [
  helmet('#26324a'),
  gear('spine03', 'cylinder', [0.05, 1.1, 0.33], [0.6, 0.03, 0.6], '#b7c3cc', [90, 0, 0]),
], RIOT, 'The riot account names officers with helmets and shields at the bus. Shield shape and colours are estimated.');
outfit('soc-riot', 'Special Operations Command riot officer: helmet with visor, long shield, baton', { shirt: '#1b222c', pants: '#1b222c' }, [
  helmet('#15191f'),
  gear('head', 'box', [0, 1.6, 0.19], [0.22, 0.15, 0.02], '#8fb0c4', [-12, 0, 0]),
  gear('spine03', 'box', [0.06, 0.92, 0.36], [0.56, 1.1, 0.03], '#a9c0d0'),
  gear('spine03', 'box', [0.06, 1.47, 0.36], [0.58, 0.04, 0.05], '#15191f'),
  gear('spine03', 'box', [0.06, 0.37, 0.36], [0.58, 0.04, 0.05], '#15191f'),
  gear('wrist.R', 'cylinder', [-0.47, 1.03, 0.4], [0.035, 0.6, 0.035], '#101215', [90, 0, 0]),
], `${SPF} ; ${SOC_KIT} ; ${SOC_DRILL}`, 'Darker blue combat dress, helmet, tactical shield and baton. The visor, shield size and colours are estimated.');

// Finish: centre every model on x and z, put its lowest point at y=0, and set size from the parts.
function finish(m) {
  const b = modelBounds(m.parts);
  const dx = -(b.min[0] + b.max[0]) / 2, dz = -(b.min[2] + b.max[2]) / 2, dy = -b.min[1];
  const parts = m.parts.map((p) => { const q = { ...p, pos: [r(p.pos[0] + dx), r(p.pos[1] + dy), r(p.pos[2] + dz)] }; if (!q.slot) delete q.slot; return q; });
  const nb = modelBounds(parts);
  const out = { id: m.id, name: m.name, kind: m.kind, license: LICENSE, size: nb.size.map((v) => r(v)), parts };
  if (m.tags?.length) out.tags = m.tags;
  return out;
}

const ASSETS = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets');

export function buildCatalogue() {
  const index = join(ASSETS, 'models', 'index.json');
  const imported = existsSync(index) ? JSON.parse(readFileSync(index, 'utf8')) : [];
  return { models: [...models.map(finish), ...imported], outfits };
}

export function writeCatalogue() {
  const out = join(ASSETS, 'catalogue.json');
  const cat = buildCatalogue();
  writeFileSync(out, JSON.stringify(cat, null, 1) + '\n');
  console.log(`wrote ${cat.models.length} models to ${out}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) writeCatalogue();
