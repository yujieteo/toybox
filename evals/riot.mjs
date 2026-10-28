// Eval case 1: the Little India riot of 8 December 2013 (Race Course Road at Hampshire Road, Singapore).
// A deterministic script that stands in for an agent. It builds the scene only through the tool commands.
import { fileURLToPath } from 'node:url';
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { Builder, rng, finish, printReport, OUT_DIR } from './lib.mjs';

const WIKI = 'https://en.wikipedia.org/wiki/2013_Little_India_riot';
const L = { estimated: true, source: 'estimated: street layout and positions are not in a public source' };
const R = rng(2013);
const pick = (a) => a[Math.floor(R() * a.length)];
const SHIRTS = ['#c8553d', '#3f6e9a', '#d9b44a', '#6f9a6a', '#a99bb8', '#e8dcc0', '#5f9ea0', '#b8765f', '#8c8c86'];
const PANTS = ['#3a3f47', '#4a5568', '#6b5b4b', '#2f4a6b', '#55595f'];

export function build() {
  const b = new Builder({ title: 'Little India, 8 December 2013', author: 'Toybox eval', ground: 'street', look: 'dusk', size: [160, 160], color: '#8f9a8a' });
  const place = (model, at, extra = {}) => b.cmd('place', { model, at, ...L, ...extra });
  const person = (id, variant, at, extra = {}) => place('person', at, { id, variant, colors: { shirt: pick(SHIRTS), pants: pick(PANTS) }, ...extra });
  const dist = (p, q) => Math.hypot(q[0] - p[0], (q[1] ?? 0) - (p[1] ?? 0), q[2] - p[2]);
  // path points are [x, z]; leg() builds absolute times from a speed
  const leg = (id, pts, t0, speed, extra = {}) => {
    const P = pts.map((p) => (p.length === 2 ? [p[0], 0, p[1]] : p));
    const times = [t0]; for (let i = 1; i < P.length; i++) times.push(Math.round((times[i - 1] + dist(P[i - 1], P[i]) / speed) * 100) / 100);
    b.cmd('move_along', { id, path: P, times, ...extra });
    return times;
  };
  const timed = (id, pts, times, extra = {}) => { b.cmd('move_along', { id, path: pts.map((p) => (p.length === 2 ? [p[0], 0, p[1]] : p)), times, ...extra }); return times.at(-1); };
  const swap = (id, t, to) => b.cmd('animate', { id, channel: 'scale', keys: to ? [{ t: 0, v: [0.001, 0.001, 0.001], ease: 'step' }, { t, v: [1, 1, 1], ease: 'step' }] : [{ t: 0, v: [1, 1, 1], ease: 'step' }, { t, v: [0.001, 0.001, 0.001], ease: 'step' }] });

  b.cmd('set_backdrop', { ground: 'street', size: [160, 160], origin: { lat: 1.30888, lon: 103.85116 }, source: 'estimated: junction of Race Course Road and Hampshire Road, read from OpenStreetMap road data', estimated: true });
  // Real footprints (OpenStreetMap, recorded once). Race Course Road has a compass bearing of about 35 degrees.
  mkdirSync(OUT_DIR, { recursive: true });
  const overpass = JSON.parse(readFileSync(new URL('./fixtures/race-course-road-osm.json', import.meta.url), 'utf8'));
  b.cmd('import_osm', { bbox: [1.3077, 103.8501, 1.3101, 103.8524], bearing: 35 }, { overpass, odblPath: join(OUT_DIR, 'riot.osm.json') });
  b.cmd('add_credit', { text: `Facts: ${WIKI}` });
  b.cmd('add_credit', { text: 'Street layout and figure positions are approximate. Faces are generic.' });

  // ---------- the street (all layout is estimated). Traffic keeps left: on Race Course Road (along z) a
  // vehicle that goes north (to -z) uses the west lane (x -2.2), one that goes south uses the east lane (x 2.2).
  place('road-junction', [0, 0], { id: 'junction' });
  for (let k = 0; k < 4; k++) for (const [s, sg] of [['n', -1], ['s', 1]]) place('road-straight', [0, 0, sg * (9 + 10 * k)], { id: `rcr-${s}${k}` });
  for (let k = 0; k < 3; k++) place('road-straight', [-(9 + 10 * k), 0, 0], { id: `hamp-w${k}`, yaw: 90 });
  place('road-zebra', [0, 0.01, -14], { id: 'zebra' });
  for (const [x, z0, id] of [[4.15, -43, 'k-en'], [4.15, 7, 'k-es'], [-4.15, -43, 'k-wn'], [-4.15, 7, 'k-ws']]) b.cmd('place_group', { model: 'kerb', count: 19, pattern: 'line', at: [x, 0, z0], angle: 270, spacing: 2, yaw: 90, id, ...L });
  for (const z of [-37, 18, 34, -44, 44]) { place('lamp-post', [4.8, 0, z], { yaw: 180 }); place('lamp-post', [-4.8, 0, -z], { yaw: 0 }); }
  place('traffic-light', [4.8, 0, -5], { id: 'tl-1' }); place('traffic-light', [-4.8, 0, 5], { id: 'tl-2' });
  for (const z of [-36, 24]) place('tree', [-5.8, 0, z], { scale: 0.7 });
  place('bus-stop', [5.5, 0, -22], { id: 'busstop', yaw: 270 });
  place('bench', [5.8, 0, 9], { id: 'bench', yaw: 270 });
  place('bin', [5.0, 0, -27]); place('bin', [-5.0, 0, 20]);
  // imported CC0 models (Kenney, Poly Haven): parked cars, a road barrier, trees and coffee-shop chairs
  place('kenney-sedan', [-28, 0, 2.2], { id: 'parked-1', yaw: 270 }); place('kenney-sedan', [-21, 0, -3.6], { id: 'parked-2', yaw: 90, colors: { body: '#4a79a5' } });
  place('kenney-road-barrier', [-12, 0, 1.2], { id: 'barrier-w1' });
  place('kenney-tree-oak', [6.0, 0, 40], { scale: 0.7 }); place('kenney-tree-oak', [-6.0, 0, 32], { scale: 0.7 });
  place('polyhaven-monobloc-chair', [6.4, 0, -29.5], { yaw: 270 }); place('polyhaven-monobloc-chair', [6.4, 0, -30.6], { yaw: 250 });
  b.cmd('place_sign', { text: 'Race Course Road', at: [5.9, 0, 5.5], yaw: 270, ...L, id: 'sign-rcr' });
  b.cmd('place_sign', { text: 'Hampshire Road', at: [10, 0, -5.6], yaw: 0, ...L, id: 'sign-hamp' });
  // A person who rides in a vehicle does not show. It appears beside the door when the vehicle stops.
  const appear = (id, t) => b.cmd('animate', { id, channel: 'scale', keys: [{ t: 0, v: [0.001, 0.001, 0.001], ease: 'step' }, { t, v: [1, 1, 1], ease: 'step' }] });

  // ---------- chapter 1: quiet evening. Pavement walkers keep apart: opposite directions use lines 0.6 m apart.
  const walkers = [['w1', 0, [8.8, -30], [8.8, -12], 1.2], ['w2', 1, [-6.4, -12], [-6.4, -33], 1.3], ['w3', 3, [9.4, -9], [9.4, -33], 1.1], ['w4', 4, [-7.0, -30], [-7.0, -16], 1.2], ['w5', 6, [8.8, 30], [8.8, 10], 1.3], ['w6', 7, [-6.6, 12], [-6.6, 30], 1.2]];
  for (const [id, v, a, z, sp] of walkers) { person(id, v, a); leg(id, [a, z], 0.5, sp, { pose: 'walk' }); }
  person('sitter', 9, [5.8, 0, 9], { pose: 'sit', yaw: 270 });
  person('chat1', 10, [-5.0, -21.3], { pose: 'stand', yaw: 90 }); person('chat2', 12, [-4.3, -21.3], { pose: 'wave', yaw: 270 });
  // through traffic drives on to points beyond the street and stops there, one behind the other
  place('car-taxi', [-2, 0, 60], { id: 'taxi', yaw: 180 }); leg('taxi', [[-2, 60], [-2, -100]], 1, 10);
  place('bus-private', [2.2, 0, -60], { id: 'bus1' }); place('car-sedan', [2.2, 0, -50], { id: 'sedan1' });
  leg('sedan1', [[2.2, -50], [2.2, 420]], 0.5, 12);

  // ---------- chapter 2: a worker leaves a bus
  b.cmd('set_lighting', { t: 12, look: 'night' });
  const busT = leg('bus1', [[2.2, -60], [2.2, -22]], 3, 5);
  person('worker', 5, [3.75, 0, -21], { colors: { shirt: '#6f9a6a', pants: '#3a3f47' } });
  appear('worker', busT.at(-1) + 0.5);
  timed('worker', [[3.75, -21], [4.5, -19.5], [7.6, -16]], [busT.at(-1) + 0.6, busT.at(-1) + 2, busT.at(-1) + 5], { pose: 'walk', end_pose: 'stand' });
  leg('bus1', [[2.2, -22], [2.2, 390]], 24, 7);

  // ---------- chapter 3: the accident (about 21:21)
  place('bus-private', [2.2, 0, -78], { id: 'bus2' });
  timed('bus2', [[2.2, -78], [2.2, -21]], [24, 31.5]);
  person('ped', 11, [5.5, 0, -15.2], { colors: { shirt: '#d9b44a', pants: '#4a5568' } });
  leg('ped', [[5.5, -15.2], [2.2, -15.2]], 28.5, 1.45, { pose: 'walk', end_pose: 'bend' });

  // ---------- chapter 4: first call at 21:23
  person('bystander', 2, [8.4, 0, -11], { yaw: 270, colors: { shirt: '#3f6e9a', pants: '#3a3f47' } });
  person('bystander2', 13, [7.4, 0, -11.8], { yaw: 270 });
  b.cmd('set_pose', { id: 'bystander', t: 38.5, pose: 'point' });
  b.cmd('set_pose', { id: 'bystander2', t: 40, pose: 'wave' });
  b.cmd('set_pose', { id: 'bystander', t: 44, pose: 'stand' });

  // ---------- chapters 5 to 7: the crowd gathers (figures are representative only).
  // Each person has its own place, 0.6 m or more from the next. Nobody stands on the paths of the
  // paramedics. Everybody walks in from the west along the line of its own place, and the person with the
  // place furthest east arrives first, so no path crosses a person who already stands there.
  const segDist = ([px, pz], [ax, az], [bx, bz]) => { const dx = bx - ax, dz = bz - az, u = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz))); return Math.hypot(px - ax - u * dx, pz - az - u * dz); };
  const paraPaths = [[[-0.65, 2.0], [0.6, -3]], [[0.6, -3], [1.2, -13.8]], [[-0.65, 3.6], [1.4, -3]], [[1.4, -3], [3.2, -13.8]]];
  const spots = [];
  while (spots.length < 60) {
    const p = [-6.2 + R() * 10.5, -13.0 + R() * 8.2];
    if (spots.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 0.6) || paraPaths.some(([a, z]) => segDist(p, a, z) < 0.7)) continue;
    spots.push(p);
  }
  spots.sort((p, q) => q[0] - p[0]);
  const crowd = [];
  spots.forEach((tgt, i) => {
    const id = `cr-${i + 1}`, wave = Math.floor(i / 20), k = i % 20;
    const arrive = [49, 72, 78][wave] + k * [0.5, 0.25, 0.25][wave], from = [-70 - i * 0.5, tgt[1]];
    person(id, Math.floor(R() * 24), [from[0], 0, from[1]], { yaw: 90 });
    leg(id, [from, tgt], Math.round((arrive - (tgt[0] - from[0]) / 1.9) * 100) / 100, 1.9, { pose: 'walk' });
    crowd.push(id);
  });

  // ---------- chapter 6: SCDF arrives (21:39). The paramedics step out on the free side of the ambulance.
  place('ambulance-scdf', [-2, 0, 78], { id: 'amb', yaw: 180 });
  timed('amb', [[-2, 78], [-2, 3]], [55, 62]);
  person('para1', 14, [-0.65, 0, 2.0], { colors: { shirt: '#b5483c', pants: '#3a3f47' } }); person('para2', 20, [-0.65, 0, 3.6], { colors: { shirt: '#b5483c', pants: '#3a3f47' } });
  for (const id of ['para1', 'para2']) appear(id, 62.5);
  timed('para1', [[-0.65, 2.0], [0.6, -3], [1.2, -13.8]], [62.6, 66, 71], { pose: 'walk', end_pose: 'bend' });
  timed('para2', [[-0.65, 3.6], [1.4, -3], [3.2, -13.8]], [62.6, 66.5, 71], { pose: 'walk', end_pose: 'bend' });

  // ---------- chapter 7: tension. Some of the crowd reacts.
  crowd.slice(0, 40).forEach((id, i) => b.cmd('set_pose', { id, t: 74 + (i % 7) * 0.6, pose: ['point', 'cheer', 'wave', 'stand'][i % 4] }));

  // ---------- chapter 8: police arrive. Both cars come up the west lane, one behind the other, and stop behind the ambulance.
  place('car-police', [-2.4, 0, 95], { id: 'pc1', yaw: 180 }); place('car-police', [-2.2, 0, 101], { id: 'pc2', yaw: 180 });
  timed('pc1', [[-2.4, 95], [-2.4, 9]], [82, 88]); timed('pc2', [[-2.2, 101], [-2.2, 16]], [82.4, 88.4]);
  // the two officers who shield the bus crew wear helmets and shields (Wikipedia: "officers with helmets and shields").
  // They walk on the east pavement to the bus door. The other four form a line between the crowd and the vehicles.
  const cops = [];
  const cop = (i, door, t, pts, speed) => {
    const id = `pol-${i + 1}`;
    place('person', [door[0], 0, door[1]], { id, variant: 18 + i, outfit: i < 2 ? 'police-shield' : 'police', yaw: 90 });
    appear(id, t);
    leg(id, [door, ...pts], t + 0.1, speed, { pose: 'walk' });
    cops.push(id);
  };
  cop(0, [-1.15, 7.6], 88.6, [[5.6, 2.0], [5.6, -17.4], [4.5, -17.4]], 2.5);
  cop(1, [-1.15, 9.0], 88.6, [[6.3, 2.6], [6.3, -18.4], [4.5, -19.7]], 2.5);
  cop(2, [-1.15, 10.4], 88.6, [[0.4, 10.4], [0.4, -1.5], [-4, -1]], 1.6);
  [[14.6, -2], [16.0, 0], [17.4, 2]].forEach(([z, x], k) => cop(3 + k, [-0.95, z], 89.0, [[0.4, z], [0.4, -1.5], [x, -1]], 1.6));

  // ---------- chapter 9: the bus driver and timekeeper leave under police shield (22:08). They walk in a file on the east pavement.
  person('driver', 17, [3.8, 0, -18.4], { colors: { shirt: '#e8dcc0', pants: '#3a3f47' } }); person('timekeeper', 8, [3.8, 0, -19.2]);
  for (const id of ['driver', 'timekeeper']) appear(id, 103);
  const file = [['pol-1', [4.5, -17.4], -3.0, 104], ['driver', [3.8, -18.4], -3.9, 104], ['timekeeper', [3.8, -19.2], -4.8, 104], ['pol-2', [4.5, -19.7], -5.7, 105.5]];
  for (const [id, at, z, t] of file) leg(id, [at, id === 'pol-2' ? [5.6, -18.5] : [5.6, at[1]], [5.6, z]], t, 1.8, { pose: 'walk' });
  crowd.slice(0, 30).forEach((id, i) => b.cmd('set_pose', { id, t: 99 + (i % 5) * 0.5, pose: ['cheer', 'point', 'wave'][i % 3] }));

  // ---------- chapter 10: vehicles overturned and burnt (22:20 to 22:40). Each wreck takes the place of its vehicle.
  const vehicles = [['pc1', 'car-police-overturned', [-2.4, 9], 110], ['pc2', 'car-police-burnt', [-2.2, 16], 112], ['amb', 'ambulance-scdf-burnt', [-2, 3], 114]];
  for (const [id, model, p, t] of vehicles) {
    place(model, [p[0], 0, p[1]], { id: `${id}-after`, yaw: 180, scale: [0.001, 0.001, 0.001] });
    swap(`${id}-after`, t, true); swap(id, t, false);
  }
  vehicles.slice(1).forEach(([id, , p, t], i) => { place('flame', [p[0] + 0.3, 0.4, p[1]], { id: `fl-${i + 1}`, scale: [0.001, 0.001, 0.001] }); b.cmd('animate', { id: `fl-${i + 1}`, channel: 'scale', keys: [{ t: 0, v: [0.001, 0.001, 0.001], ease: 'step' }, { t: t + 0.5, v: [2, 2, 2], ease: 'step' }, { t: 144, v: [0.001, 0.001, 0.001], ease: 'step' }] }); });
  place('car-police-overturned', [-6, 0, 12], { id: 'pc3-after', yaw: 60, scale: [0.001, 0.001, 0.001] }); swap('pc3-after', 111, true);
  crowd.slice(0, 40).forEach((id, i) => b.cmd('set_pose', { id, t: 112 + (i % 6) * 0.5, pose: ['cheer', 'point', 'wave'][i % 3] }));

  // ---------- chapter 11: SOC arrives (22:50). Riot officers walk in from the south and form a shield line south of the burnt vehicles.
  // A long shield needs a walk, not a run. The real troops were larger; the number, the route and the line are estimated.
  const soc = [];
  for (let i = 0; i < 10; i++) {
    const id = `soc-${i + 1}`, x = -5.4 + i * 1.2, far = [x * 0.5, 105], end = [x, 22];
    place('person', [far[0], 0, far[1]], { id, variant: [0, 1, 3, 4, 6, 7, 9, 13, 15, 22][i], outfit: 'soc-riot', yaw: 180 });
    const t0 = Math.round((126 - dist([far[0], 0, far[1]], [end[0], 0, end[1]]) / 2.8) * 100) / 100;
    appear(id, t0);
    leg(id, [far, end], t0, 2.8, { pose: 'walk', end_pose: 'stand' });
    soc.push(id);
  }
  crowd.slice(0, 60).forEach((id, i) => b.cmd('set_pose', { id, t: 124 + (i % 8) * 0.4, pose: 'stand' }));

  // ---------- chapter 12: the crowd disperses (23:30). Everybody runs west at the same time and speed, so nobody meets.
  crowd.forEach((id) => {
    const here = b.scene.tracks.find((t) => t.object === id && t.channel === 'at').keys.at(-1).v;
    leg(id, [[here[0], here[2]], [here[0] - 70, here[2]]], 132.2, 4.5, { pose: 'run', end_pose: 'stand' });
  });

  // ---------- chapter 13: aftermath (06:45 on 9 December). A clean-up crew walks in from the west in a file.
  b.cmd('set_lighting', { t: 144, look: 'day' });
  // Each cleaner walks along its own line to the side of one wreck.
  [['clean-1', 12, 17], ['clean-2', 15, 8.5], ['clean-3', 19, 3]].forEach(([id, v, z], i) => {
    person(id, v, [-24, 0, z], { colors: { shirt: '#d98a3d', pants: '#3a3f47' }, yaw: 90 });
    leg(id, [[-24, z], [-3.8, z]], 142 + i * 0.7, 1.8, { pose: 'walk', end_pose: 'bend' });
  });

  // ---------- chapter 14: the Committee of Inquiry met in a building, not on the street. It gets its own room,
  // far from the street and outside the OpenStreetMap footprints, and the camera cuts to it.
  const ROOM = [320, 0, 0];
  b.cmd('build_room', { id: 'coi-room', at: ROOM, size: [10, 8, 3.5], doors: [{ wall: 's', at: 8 }], ...L });
  for (const dx of [-1.2, 0, 1.2]) place('table', [ROOM[0] + dx, 0, ROOM[2] - 1.6], { ...L });
  b.cmd('place_sign', { text: 'Committee of Inquiry', at: [ROOM[0], 0, ROOM[2] - 3.6], model: 'sign-large', yaw: 0, ...L, id: 'coi-sign' });
  [['coi-1', 3, -1.2], ['coi-2', 6, 0], ['coi-3', 21, 1.2]].forEach(([id, v, dx]) => {
    place('chair', [ROOM[0] + dx, 0, ROOM[2] - 2.4], { ...L });
    person(id, v, [ROOM[0] + dx, 0, ROOM[2] - 2.4], { yaw: 0, pose: 'sit' });
  });
  place('table', [ROOM[0], 0, ROOM[2] + 1.0], { ...L, id: 'coi-witness-table' });
  place('chair', [ROOM[0], 0, ROOM[2] + 1.8], { ...L, yaw: 180 });
  person('coi-witness', 16, [ROOM[0], 0, ROOM[2] + 1.8], { yaw: 180, pose: 'sit' });
  b.cmd('set_cutaway', { ceilings: true, nearWalls: true });
  b.cmd('set_lighting', { t: 156, look: 'indoor' });

  // ---------- camera and chapters
  const VIEW0 = { wide: 20, medium: 20, close: 15, top: 0, orbit: 0 };
  const cam = (start, end, segs) => segs.forEach((s, i) => {
    const view = s.view ?? VIEW0[s.shot];
    const args = (t, v) => ({ t, shot: s.shot, frame: s.frame, ...(v !== undefined ? { view: v } : {}), ...(s.opts || {}) });
    b.cmd('set_camera', args(s.t, view));
    const hold = (segs[i + 1]?.t ?? end) - 1.0;
    if (hold > s.t + 0.05) b.cmd('set_camera', args(hold, view === undefined ? undefined : view + (s.shot === 'orbit' ? 45 : 6)));
  });
  const chapter = (id, start, end, title, clock, caption, focus, shot, source, est, segs) => {
    cam(start, end, segs);
    b.cmd('add_chapter', { id, start, end, title, clock, caption, focus, shot, source, ...(est ? { estimated: true } : { measured: true }) });
  };
  const street = ['rcr-n0', 'rcr-n1', 'junction'];
  chapter('c1', 0, 12, 'A quiet evening', '', 'Race Course Road in Little India, Singapore. The evening of 8 December 2013. Shophouses line the street and people walk home. The layout here is approximate.', ['w1', 'w2'], 'wide', 'estimated: scene of an ordinary evening, not a recorded event', true,
    [{ t: 0, shot: 'wide', frame: street, view: 200, opts: { elevation: 45 } }, { t: 7, shot: 'medium', frame: ['w1', 'w3', 'chat1', 'chat2'] }]);
  chapter('c2', 12, 24, 'A worker leaves a bus', '', 'A private bus stops by the bus stop and a worker steps off. This is a typical scene, not a recorded one. The details are approximate.', ['bus1', 'busstop'], 'medium', 'estimated: illustrative scene', true,
    [{ t: 12, shot: 'medium', frame: ['bus1', 'busstop'] }, { t: 18.5, shot: 'close', frame: ['worker'] }]);
  chapter('c3', 24, 36, 'The accident', '21:21', 'At about 21:21 a private bus hit a pedestrian on Race Course Road, near Tekka Lane. The pedestrian died. Positions here are approximate.', ['ped'], 'wide', WIKI, false,
    [{ t: 24, shot: 'wide', frame: ['ped', 'zebra'], opts: { elevation: 50 } }, { t: 29.5, shot: 'medium', frame: ['ped', 'bus2'] }]);
  chapter('c4', 36, 48, 'The first call', '21:23', 'At 21:23 the police received the first call. It reported a traffic disruption. It did not mention any violence.', ['bystander'], 'close', WIKI, false,
    [{ t: 36, shot: 'close', frame: ['bystander', 'bystander2'] }, { t: 42, shot: 'medium', frame: ['bystander', 'ped', 'bus2'] }]);
  b.cmd('add_callout', { start: 37, end: 46, text: '21:23 first call', object: 'bystander', source: WIKI, measured: true });
  chapter('c5', 48, 60, 'People gather', '21:31', 'From about 21:31 to 21:38 the first police and emergency vehicles arrived. The crowd grew to about 100 people. The figures here are representative.', ['bus2'], 'wide', WIKI, false,
    [{ t: 48, shot: 'wide', frame: ['ped', 'bus2'], view: 50 }, { t: 53.5, shot: 'medium', frame: ['bus2', 'ped', ...crowd.slice(0, 12)] }]);
  chapter('c6', 60, 72, 'SCDF arrives', '21:39', 'At 21:39 the first SCDF vehicle arrived. It was a Red Rhino. The scene shows an ambulance as a stand-in. At 21:56 a paramedic pronounced the pedestrian dead.', ['amb'], 'follow', WIKI, false,
    [{ t: 60, shot: 'follow', frame: ['amb'] }, { t: 66.5, shot: 'medium', frame: ['para1', 'para2', 'ped'] }]);
  chapter('c7', 72, 84, 'Tension', '21:45', 'At 21:45 the crowd reached about 400. Later reports say 300. The Special Operations Command was activated. The scene shows 60 representative figures.', ['ped'], 'top', WIKI, false,
    [{ t: 72, shot: 'top', frame: ['ped', ...crowd.slice(0, 40)] }]);
  chapter('c8', 84, 96, 'Police arrive', '', 'In all, over 300 officers were dispatched that night. The scene shows a small group of them. Their positions are approximate.', ['pc1'], 'medium', WIKI, false,
    [{ t: 84, shot: 'medium', frame: ['pc1', 'pc2'] }, { t: 90.5, shot: 'wide', frame: ['pc1', 'pc2', ...cops] }]);
  chapter('c9', 96, 108, 'Leaving the bus', '22:08', 'At 22:08 the bus driver and the timekeeper left the bus under police shield protection. The crowd attacked.', ['driver'], 'close', WIKI, false,
    [{ t: 96, shot: 'close', frame: ['driver', 'timekeeper'], view: 45 }, { t: 102, shot: 'medium', frame: ['driver', 'timekeeper', 'pol-1', 'pol-2'] }]);
  chapter('c10', 108, 120, 'Vehicles overturned and burnt', '22:20', 'From 22:20 to 22:40 rioters flipped six vehicles and set four on fire. The scene shows only a few of them.', ['pc1', 'amb'], 'wide', WIKI, false,
    [{ t: 108, shot: 'wide', frame: ['pc1', 'pc2', 'amb'], view: 10 }, { t: 114, shot: 'orbit', frame: ['pc1-after', 'pc2-after', 'amb-after', 'fl-1', 'fl-2'], view: 10 }]);
  chapter('c11', 120, 132, 'Special Operations Command', '22:50', 'At 22:50 the Special Operations Command arrived. Many rioters had surrendered and the crowd had become smaller. The officers shown are representative.', ['soc-1'], 'medium', WIKI, false,
    [{ t: 120, shot: 'medium', frame: ['soc-1', 'soc-2', 'soc-3'], view: 180 }, { t: 126, shot: 'medium', frame: soc, view: 180, opts: { elevation: 20 } }]);
  chapter('c12', 132, 144, 'The crowd disperses', '23:30', 'By 23:30 all the rioters had dispersed from Race Course Road and the streets nearby.', ['ped'], 'top', WIKI, false,
    [{ t: 132, shot: 'top', frame: ['ped', 'junction', 'rcr-s1', ...soc] }]);
  chapter('c13', 144, 156, 'The next morning', '06:45', 'In all, 62 people were hurt: 37 police officers, 12 SCDF officers, 5 Certis officers and 8 civilians. Race Course Road fully reopened at 06:45.', ['pc1-after'], 'wide', WIKI, false,
    [{ t: 144, shot: 'wide', frame: ['pc1-after', 'pc2-after', 'amb-after', 'clean-1', 'clean-2', 'clean-3'], view: 350 }]);
  chapter('c14', 156, 168, 'Committee of Inquiry', '', 'A Committee of Inquiry was appointed on 13 December 2013. It reported on 27 June 2014. It ruled out racial and labour issues as causes. The hearing room here is approximate.', ['coi-sign'], 'medium', WIKI, false,
    [{ t: 156, shot: 'medium', frame: ['coi-sign', 'coi-1', 'coi-2', 'coi-3'], opts: { cut: true } }]);
  return finish(b, 'riot');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) { const rep = build(); printReport(rep); process.exit(rep.ok ? 0 : 1); }
