// Eval case 2: an indoor walk through HomeTeamNS Khatib clubhouse (Singapore).
// Public pages give the address and the name of the ballroom. The floor plan is not public,
// so every size, position and route here is an estimate. The script uses only the tool commands.
import { fileURLToPath } from 'node:url';
import { Builder, finish, printReport } from './lib.mjs';

const PAGE = 'https://www.hometeamns.sg/khatib';
const E = { estimated: true, source: 'estimated' };

export function build() {
  const b = new Builder({ title: 'HomeTeamNS Khatib: a visit to the Grand Ballroom (approximate)', author: 'Toybox eval', ground: 'plain', look: 'indoor', size: [140, 100], color: '#d9d4c7' });
  const cmd = (t, a) => b.cmd(t, a);
  const place = (model, at, extra = {}) => cmd('place', { model, at, ...E, ...extra });
  cmd('set_cutaway', { ceilings: true, nearWalls: true });
  cmd('add_credit', { text: `Public facts: address and ballroom name from ${PAGE}. The floor plan is not public. All sizes, positions and the route are approximate.` });

  // ---------- ground floor, x east, z south. Entrance on the south wall.
  const gf = cmd('build_room', { id: 'gf', at: [20, 0, -12], size: [70, 32, 4.5], doors: [{ wall: 's', at: 15, width: 2.4 }], ceiling: false, ...E });
  const door = gf.ids.find((i) => i.startsWith('gf-s-door'));
  place('reception-desk', [-5, 0, -6], { id: 'desk' });
  place('turnstile', [-1.1, 0, -9], { id: 'ts-1' }); place('turnstile', [1.1, 0, -9], { id: 'ts-2' });
  place('sofa', [-8, 0, 0.5], { id: 'sofa' }); place('plant', [4, 0, 2.5]); place('plant', [-10, 0, -12]);
  place('notice-board', [5, 0, -2.5], { id: 'board', label: 'Notices' });
  // imported CC0 models (Kenney, Poly Haven): a lounge corner and a wet floor sign at the entrance
  place('kenney-sofa', [-12, 0, 0.5], { id: 'sofa-2', yaw: 90 }); place('polyhaven-coffee-table', [-10.3, 0, 0.5], { id: 'coffee-table' });
  place('kenney-potted-plant', [-13.6, 0, 2.6]); place('polyhaven-wet-floor-sign', [1.6, 0, 1.8], { id: 'wet-sign', yaw: 200 });
  place('lift-door', [22, 0, -11.6], { id: 'lift-1', yaw: 0 }); place('lift-door', [25, 0, -11.6], { id: 'lift-2', yaw: 0 });
  // stairs: two flights with a landing, a U shape up to level 2 at 4.5 m
  const A = cmd('build_stairs', { id: 'stair-a', from: [12, 0, -11.1], yaw: 0, height: 2.25, ...E });
  const B = cmd('build_stairs', { id: 'stair-b', from: [13.3, 2.25, -7.18], yaw: 180, height: 2.25, ...E });
  cmd('place', { model: 'floor-tile', at: [12.65, 2.23, -6.5], scale: [1.4, 1, 0.65], tags: ['floor'], id: 'landing', ...E });

  // ---------- level 2: a corridor and the ballroom (1,014 square metres in the public page: 39 m by 26 m is an estimate of its shape)
  const corr = cmd('build_room', { id: 'corr', at: [13.3, 4.5, -18], size: [3, 14, 3.2], doors: [{ wall: 's', at: 1.5, width: 1.4 }, { wall: 'e', at: 10, width: 1.6 }], ...E });
  const ball = cmd('build_room', { id: 'ball', at: [34.3, 4.5, -15], size: [39, 26, 6], doors: [{ wall: 'w', at: 13, width: 1.6 }], ...E });
  const bdoor = ball.ids.find((i) => i.startsWith('ball-w-door'));
  cmd('place', { model: 'stage', at: [51.5, 4.5, -15], yaw: 270, id: 'stage', ...E, tags: [] });
  let k = 0;
  for (const x of [26, 32, 38, 44]) for (const z of [-24, -15, -6]) place('banquet-table-8', [x, 4.5, z], { id: `bt-${++k}` });
  place('plant', [17, 4.5, -13], { id: 'plant-2' }); place('plant', [17, 4.5, -17]);

  // ---------- the visitor (one person, variant fixed)
  place('person', [0, 0, 12], { id: 'visitor', variant: 9, colors: { shirt: '#3f6e9a', pants: '#3a3f47' } });
  const P = [[0, 0, 12], [0, 0, 3.5], [0, 0, -4], [0, 0, -8], [0, 0, -10.2], [8, 0, -12.3], [12, 0, -12.3], [12, 0, -11.1], [12, 2.25, -7.18], [12.65, 2.25, -6.5], [13.3, 2.25, -7.18], [13.3, 4.5, -11.1], [13.3, 4.5, -15], [14.8, 4.5, -15], [17, 4.5, -15], [20, 4.5, -18.5], [46, 4.5, -18.5]];
  const speed = 1.15, T = [0];
  for (let i = 1; i < P.length; i++) T.push(Math.round((T[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1], P[i][2] - P[i - 1][2]) / speed) * 100) / 100);
  cmd('move_along', { id: 'visitor', path: P, times: T, pose: 'walk', end_pose: 'stand' });
  const at = (i) => T[i];
  const ends = { entrance: at(1), reception: at(3), turn: at(4), stairs: at(11), corridor: at(13), door: at(14), hall: at(16) };

  // ---------- camera and chapters. Each chapter lasts until the visitor reaches the next stage.
  const cam = (s, e, segs) => segs.forEach((g, i) => {
    const base = { t: g.t, shot: g.shot, frame: g.frame, ...(g.view !== undefined ? { view: g.view } : {}), ...(g.opts || {}) };
    cmd('set_camera', base);
    const hold = (segs[i + 1]?.t ?? e) - 1.0;
    if (hold > g.t + 0.05) cmd('set_camera', { ...base, t: hold, ...(g.view !== undefined ? { view: g.view + 6 } : {}) });
  });
  const chapter = (id, s, e, title, caption, focus, shot, segs, source = 'estimated', est = true) => {
    cam(s, e, segs);
    cmd('add_chapter', { id, start: s, end: e, title, caption, focus, shot, source, ...(est ? { estimated: true } : { measured: true }) });
  };
  const seg = [0, 7.5, ends.reception, ends.turn, ends.stairs, ends.corridor, ends.door, ends.hall];
  const bt = ['bt-1', 'bt-2', 'bt-5', 'bt-6'];
  // enforce at least 9 s per chapter by stretching the plan: chapters follow the walk but never shorter than 9 s
  const cuts = []; let last = 0;
  for (const c of [ends.entrance + 2, ends.reception, ends.turn + 0.5, ends.stairs - 6, ends.stairs, ends.corridor, ends.door + 1, ends.hall - 4]) { const t = Math.max(c, last + 9); cuts.push(Math.round(t * 10) / 10); last = t; }
  const total = Math.max(last + 10, ends.hall + 4);
  const edges = [0, ...cuts, Math.round(total * 10) / 10];
  const ch = (i) => [edges[i], edges[i + 1]];
  chapter('c1', ...ch(0), 'The entrance', 'The visitor arrives at the HomeTeamNS Khatib clubhouse, 2 Yishun Walk, Singapore 767944. The layout in this scene is approximate.', ['visitor', door], 'wide',
    [{ t: edges[0], shot: 'wide', frame: ['visitor', door], view: 25 }], PAGE, false);
  chapter('c2', ...ch(1), 'Reception', 'The visitor passes the reception desk. The size and place of the desk are estimates. The floor plan is not public.', ['desk', 'visitor'], 'medium',
    [{ t: edges[1], shot: 'medium', frame: ['desk', 'visitor'], view: 30 }]);
  chapter('c3', ...ch(2), 'The turnstile', 'The visitor walks through the gate. The gates are drawn as an estimate.', ['ts-1', 'visitor'], 'close',
    [{ t: edges[2], shot: 'close', frame: ['ts-1', 'ts-2', 'visitor'], view: 20 }]);
  chapter('c4', ...ch(3), 'To the stairs', 'The route to the stairs is an estimate. Lifts are the other way up.', ['lift-1', 'visitor'], 'top',
    [{ t: edges[3], shot: 'top', frame: ['visitor', 'lift-1', 'stair-a', 'stair-b', 'ts-1'] }]);
  chapter('c5', ...ch(4), 'Up the stairs', 'The visitor climbs two flights to the second level. The height of one floor is an estimate.', ['stair-a', 'visitor'], 'follow',
    [{ t: edges[4], shot: 'medium', frame: ['stair-a', 'stair-b', 'visitor'], view: 60 }, { t: edges[4] + 5.5, shot: 'follow', frame: ['visitor'] }]);
  chapter('c6', ...ch(5), 'The corridor', 'On the second level the visitor walks along a corridor. The corridor is an estimate.', ['corr-floor', 'visitor'], 'top',
    [{ t: edges[5], shot: 'top', frame: ['corr-floor', 'visitor'] }]);
  chapter('c7', ...ch(6), 'The ballroom door', 'The visitor enters the ballroom. The public page names it the Grand Ballroom.', ['visitor', bdoor], 'medium',
    [{ t: edges[6], shot: 'medium', frame: ['visitor', bdoor], view: 40 }], PAGE, false);
  chapter('c8', ...ch(7), 'The Grand Ballroom', 'The Grand Ballroom is a pillar-free space of 1,014 square metres. The tables and the stage are approximate.', ['stage', ...bt], 'wide',
    [{ t: edges[7], shot: 'wide', frame: ['stage', 'bt-1', 'bt-12', 'visitor'], view: 15 }], PAGE, false);
  chapter('c9', ...ch(8), 'Tables and stage', 'The visitor stops near the banquet tables. This is a model of a possible layout. Do not use it to find your way.', ['bt-6', 'visitor'], 'orbit',
    [{ t: edges[8], shot: 'orbit', frame: ['bt-6', 'bt-7', 'visitor'], view: 0 }]);
  return finish(b, 'hometeamns', { fullPeople: false });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) { const rep = build(); printReport(rep); process.exit(rep.ok ? 0 : 1); }
