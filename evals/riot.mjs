// Eval case 1: the Little India riot of 8 December 2013 (Race Course Road at Hampshire Road, Singapore).
// A deterministic script that stands in for an agent. It builds the scene only through the tool commands.
import { fileURLToPath } from 'node:url';
import { Builder, rng, finish, printReport } from './lib.mjs';

const WIKI = 'https://en.wikipedia.org/wiki/2013_Little_India_riot';
const L = { estimated: true, source: 'estimated: street layout and positions are not in a public source' };
const R = rng(2013);
const pick = (a) => a[Math.floor(R() * a.length)];
const SHIRTS = ['#c8553d', '#3f6e9a', '#d9b44a', '#6f9a6a', '#a99bb8', '#e8dcc0', '#5f9ea0', '#b8765f', '#8c8c86'];
const PANTS = ['#3a3f47', '#4a5568', '#6b5b4b', '#2f4a6b', '#55595f'];
const NAVY = { shirt: '#2f4a6b', pants: '#2f4a6b' };

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

  b.cmd('set_backdrop', { ground: 'street', size: [160, 160], origin: { lat: 1.3068, lon: 103.8512 }, source: 'estimated: approximate position of Race Course Road at Hampshire Road, read from a map', estimated: true });
  b.cmd('add_credit', { text: `Facts: ${WIKI}` });
  b.cmd('add_credit', { text: 'Street layout and figure positions are approximate. Faces are generic.' });

  // ---------- the street (all layout is estimated)
  place('road-junction', [0, 0], { id: 'junction' });
  for (let k = 0; k < 4; k++) for (const [s, sg] of [['n', -1], ['s', 1]]) place('road-straight', [0, 0, sg * (9 + 10 * k)], { id: `rcr-${s}${k}` });
  for (let k = 0; k < 3; k++) for (const [s, sg] of [['e', 1], ['w', -1]]) place('road-straight', [sg * (9 + 10 * k), 0, 0], { id: `hamp-${s}${k}`, yaw: 90 });
  place('road-zebra', [0, 0.01, -14], { id: 'zebra' });
  for (const [x, z0, id] of [[4.15, -43, 'k-en'], [4.15, 7, 'k-es'], [-4.15, -43, 'k-wn'], [-4.15, 7, 'k-ws']]) b.cmd('place_group', { model: 'kerb', count: 19, pattern: 'line', at: [x, 0, z0], angle: 270, spacing: 2, yaw: 90, id, ...L });
  const walls = ['#d9a5a0', '#e8dcc0', '#9db89a', '#d8c6a0', '#a9c3d2', '#d9b79a'], trims = ['#5f9ea0', '#4f7a52', '#b5483c', '#4a79a5'];
  let n = 0;
  for (const [side, x, yaw] of [['e', 14.2, 270], ['w', -14.2, 90]]) for (const [dir, sg] of [['n', -1], ['s', 1]]) for (let i = 0; i < 6; i++, n++) {
    place(n % 3 === 1 ? 'shophouse-3' : 'shophouse-2', [x, 0, sg * (10 + 6 * i)], { id: `sh-${side}-${dir}-${i}`, yaw, colors: { wall: walls[n % walls.length], trim: trims[n % trims.length] } });
  }
  for (const z of [-37, 18, 34, -44, 44]) { place('lamp-post', [4.8, 0, z], { yaw: 180 }); place('lamp-post', [-4.8, 0, -z], { yaw: 0 }); }
  place('traffic-light', [4.8, 0, -5], { id: 'tl-1' }); place('traffic-light', [-4.8, 0, 5], { id: 'tl-2' });
  for (const z of [-36, -10, 24]) place('tree', [-5.8, 0, z], { scale: 0.7 });
  place('bus-stop', [5.5, 0, -22], { id: 'busstop', yaw: 270 });
  place('bench', [5.8, 0, 9], { id: 'bench', yaw: 270 });
  place('bin', [5.0, 0, -27]); place('bin', [-5.0, 0, 20]);
  b.cmd('place_sign', { text: 'Race Course Road', at: [5.9, 0, 5.5], yaw: 270, ...L });
  b.cmd('place_sign', { text: 'Hampshire Road', at: [10, 0, -5.6], yaw: 0, ...L });

  // ---------- chapter 1: quiet evening
  const walkers = [['w1', 0, [5.5, -30], [5.5, -12], 1.2], ['w2', 1, [-5.5, -12], [-5.5, -33], 1.3], ['w3', 3, [5.5, -9], [5.5, -33], 1.1], ['w4', 4, [-5.5, -30], [-5.5, -10], 1.2], ['w5', 6, [5.5, 30], [5.5, 10], 1.3], ['w6', 7, [-5.5, 12], [-5.5, 32], 1.2]];
  for (const [id, v, a, z, sp] of walkers) { person(id, v, a); leg(id, [a, z], 0.5, sp, { pose: 'walk' }); }
  person('sitter', 9, [5.8, 0, 9], { pose: 'sit', yaw: 270 });
  person('chat1', 10, [-5.0, -21.3], { pose: 'stand', yaw: 90 }); person('chat2', 12, [-4.3, -21.3], { pose: 'wave', yaw: 270 });
  place('car-taxi', [-2, 0, 60], { id: 'taxi' }); leg('taxi', [[-2, 60], [-2, -60]], 1, 10);
  place('bus-private', [2.2, 0, -60], { id: 'bus1' }); place('car-sedan', [2.2, 0, 70], { id: 'sedan1' });
  leg('sedan1', [[2.2, 70], [2.2, -70]], 2, 12);

  // ---------- chapter 2: a worker leaves a bus
  b.cmd('set_lighting', { t: 12, look: 'night' });
  const busT = leg('bus1', [[2.2, -60], [2.2, -22]], 3, 5);
  person('worker', 5, [2.2, 0, -60], { colors: { shirt: '#6f9a6a', pants: '#3a3f47' } });
  timed('worker', [[2.2, -60], [2.2, -22], [3.7, -21], [5.8, -17.5]], [3, busT.at(-1), busT.at(-1) + 1.5, busT.at(-1) + 4.5], { pose: 'walk', end_pose: 'stand' });
  leg('bus1', [[2.2, -22], [2.2, 80]], 24, 7);

  // ---------- chapter 3: the accident (about 21:21)
  place('bus-private', [2.2, 0, -70], { id: 'bus2' });
  const b2 = timed('bus2', [[2.2, -70], [2.2, -21]], [24, 31.5]);
  person('ped', 11, [5.5, 0, -15.2], { colors: { shirt: '#d9b44a', pants: '#4a5568' } });
  leg('ped', [[5.5, -15.2], [2.2, -15.2]], 28.5, 1.45, { pose: 'walk', end_pose: 'bend' });

  // ---------- chapter 4: first call at 21:23
  person('bystander', 2, [6.3, 0, -11], { yaw: 270, colors: { shirt: '#3f6e9a', pants: '#3a3f47' } });
  person('bystander2', 13, [5.2, 0, -11.8], { yaw: 270 });
  b.cmd('set_pose', { id: 'bystander', t: 38.5, pose: 'point' });
  b.cmd('set_pose', { id: 'bystander2', t: 40, pose: 'wave' });
  b.cmd('set_pose', { id: 'bystander', t: 44, pose: 'stand' });

  // ---------- chapters 5 to 7: the crowd gathers (figures are representative only)
  const crowd = [];
  const addCrowd = (count, a0, a1) => {
    for (let i = 0; i < count; i++) {
      const id = `cr-${crowd.length + 1}`, th = (R() * 2 - 1) * 1.35, rad = 2.8 + R() * 9;
      const tgt = [Math.max(-6.5, Math.min(6.5, 2.2 + Math.sin(th) * rad * 1.1)), -15.2 + Math.cos(th) * rad * 0.9];
      tgt[1] = Math.max(tgt[1], -14.2);
      const far = pick([[-70, 1.5], [70, -1.5], [1.5, 70], [-1.5, 72], [72, 2.5], [-72, -2.5]]);
      const arrive = a0 + R() * (a1 - a0), tStart = Math.max(0.2, arrive - dist([far[0], 0, far[1]], [tgt[0], 0, tgt[1]]) / 1.9);
      person(id, Math.floor(R() * 24), far);
      leg(id, [far, tgt], tStart, 1.9, { pose: 'walk' });
      crowd.push(id);
    }
  };
  addCrowd(20, 49, 59); addCrowd(20, 61, 71); addCrowd(20, 73, 82);

  // ---------- chapter 6: SCDF arrives (21:39)
  place('ambulance-scdf', [-2, 0, 40], { id: 'amb' });
  const ambT = [58, 62];
  timed('amb', [[-2, 40], [-2, 3]], ambT);
  person('para1', 14, [-2, 0, 40], { colors: { shirt: '#b5483c', pants: '#3a3f47' } }); person('para2', 20, [-2, 0, 40], { colors: { shirt: '#b5483c', pants: '#3a3f47' } });
  timed('para1', [[-2, 40], [-2, 3], [-3.6, 3], [0, -8], [1.2, -13.8]], [58, 62, 63, 69, 71], { pose: 'walk', end_pose: 'bend' });
  timed('para2', [[-2, 40], [-2, 3], [-3.7, 3.8], [-0.4, -7.5], [3.2, -13.8]], [58, 62, 63, 69, 71], { pose: 'walk', end_pose: 'bend' });

  // ---------- chapter 7: tension. Some of the crowd reacts.
  crowd.slice(0, 40).forEach((id, i) => b.cmd('set_pose', { id, t: 74 + (i % 7) * 0.6, pose: ['point', 'cheer', 'wave', 'stand'][i % 4] }));

  // ---------- chapter 8: police arrive
  place('car-police', [-2, 0, 60], { id: 'pc1' }); place('car-police', [2.2, 0, 60], { id: 'pc2' });
  timed('pc1', [[-2.4, 60], [-2.4, 9]], [82, 88]); timed('pc2', [[1.9, 60], [1.9, 6]], [82.4, 88.4]);
  const cops = [];
  for (let i = 0; i < 6; i++) {
    const id = `pol-${i + 1}`, car = i < 3 ? [-2.4, 9] : [1.9, 6], x = -5 + i * 2;
    person(id, 18 + i, [car[0], 0, 60], { colors: NAVY });
    const exit = [car[0] + (i < 3 ? 1.5 : -1.5), car[1]];
    const t1 = 88 + (i < 3 ? 0 : 0.4) + 1;
    timed(id, [[car[0], 60], car, exit, [x, -1]], [i < 3 ? 82 : 82.4, i < 3 ? 88 : 88.4, t1, Math.round((t1 + dist([exit[0], 0, exit[1]], [x, 0, -1]) / 1.6) * 100) / 100], { pose: 'walk' });
    cops.push(id);
  }

  // ---------- chapter 9: the bus driver and timekeeper leave under police shield (22:08)
  person('driver', 17, [2.2, 0, -70], { colors: { shirt: '#e8dcc0', pants: '#3a3f47' } }); person('timekeeper', 8, [2.2, 0, -70]);
  for (const id of ['driver', 'timekeeper']) timed(id, [[2.2, -70], [2.2, -21]], [24, 31.5], { pose: 'walk' });
  timed('driver', [[2.2, -21], [3.7, -19.4], [6.2, -10], [6.2, -3]], [31.6, 98, 103.5, 107], { pose: 'walk' });
  timed('timekeeper', [[2.2, -21], [3.7, -19.9], [6.8, -10.5], [6.8, -3]], [31.6, 98, 103.5, 107], { pose: 'walk' });
  // the first two officers walk from the line to the bus door, then escort
  timed('pol-1', [[-5, -1], [4.6, -18.5], [4.8, -17.5], [7.0, -10], [7.0, -3]], [93.2, 97.6, 98, 103.5, 107], { pose: 'walk' });
  timed('pol-2', [[-3, -1], [4.9, -19.6], [5.1, -18.6], [7.6, -11], [7.6, -3]], [93.2, 97.6, 98, 103.5, 107], { pose: 'walk' });
  crowd.slice(0, 30).forEach((id, i) => b.cmd('set_pose', { id, t: 99 + (i % 5) * 0.5, pose: ['cheer', 'point', 'run'][i % 3] }));

  // ---------- chapter 10: vehicles overturned and burnt (22:20 to 22:40)
  const vehicles = [['pc1', 'car-police-overturned', [-2.4, 9], 110], ['pc2', 'car-police-burnt', [1.9, 6], 112], ['amb', 'ambulance-scdf-burnt', [-2, 3], 114]];
  for (const [id, model, p, t] of vehicles) {
    place(model, [p[0], 0, p[1]], { id: `${id}-after`, yaw: 180, scale: [0.001, 0.001, 0.001] });
    swap(`${id}-after`, t, true); swap(id, t, false);
  }
  vehicles.slice(1).forEach(([id, , p, t], i) => { place('flame', [p[0] + 0.3, 0.4, p[1]], { id: `fl-${i + 1}`, scale: [0.001, 0.001, 0.001] }); b.cmd('animate', { id: `fl-${i + 1}`, channel: 'scale', keys: [{ t: 0, v: [0.001, 0.001, 0.001], ease: 'step' }, { t: t + 0.5, v: [2, 2, 2], ease: 'step' }, { t: 144, v: [0.001, 0.001, 0.001], ease: 'step' }] }); });
  place('car-police-overturned', [-6, 0, 12], { id: 'pc3-after', yaw: 60, scale: [0.001, 0.001, 0.001] }); swap('pc3-after', 111, true);
  crowd.slice(0, 40).forEach((id, i) => b.cmd('set_pose', { id, t: 112 + (i % 6) * 0.5, pose: ['cheer', 'point', 'wave'][i % 3] }));

  // ---------- chapter 11: SOC arrives (22:50)
  const soc = [];
  for (let i = 0; i < 6; i++) {
    const id = `soc-${i + 1}`, x = -5 + i * 2, far = [x * 0.6, 56], end = [x, 3.2];
    person(id, [0, 1, 3, 4, 6, 7][i], [far[0], 0, far[1]], { colors: { shirt: '#4f7a52', pants: '#3a3f47' } });
    leg(id, [far, end], 127 - dist([far[0], 0, far[1]], [end[0], 0, end[1]]) / 4.2, 4.2, { pose: 'run', end_pose: 'stand' });
    soc.push(id);
  }
  crowd.slice(0, 60).forEach((id, i) => b.cmd('set_pose', { id, t: 124 + (i % 8) * 0.4, pose: 'stand' }));

  // ---------- chapter 12: the crowd disperses (23:30)
  crowd.forEach((id, i) => {
    const o = b.scene.objects.find((x) => x.id === id), tr = b.scene.tracks.find((t) => t.object === id && t.channel === 'at');
    const here = tr.keys.at(-1).v, far = [[-70, 1.5], [70, -1.5], [1.5, 70], [-1.5, 72]][i % 4];
    leg(id, [[here[0], here[2]], far], 132.2 + (i % 10) * 0.4, 4.5, { pose: 'run', end_pose: 'stand' });
  });
  cops.forEach((id) => null);

  // ---------- chapter 13: aftermath (06:45 on 9 December)
  b.cmd('set_lighting', { t: 144, look: 'day' });
  [['clean-1', 12, [-3, 40], [-3, 12]], ['clean-2', 15, [3, 41], [3.5, 12.5]], ['clean-3', 19, [-1, 42], [-5, 3]]].forEach(([id, v, a, z], i) => {
    person(id, v, [a[0], 0, a[1]], { colors: { shirt: '#d98a3d', pants: '#3a3f47' } });
    leg(id, [a, z], 143 + i * 0.7, 1.5, { pose: 'walk', end_pose: 'bend' });
  });

  // ---------- chapter 14: the Committee of Inquiry
  b.cmd('place_sign', { text: 'Committee of Inquiry, 13 Dec 2013 to 27 Jun 2014', at: [-10, 0, -6.3], model: 'sign-large', yaw: 0, ...L, id: 'coi-sign' });
  [['coi-1', 3, [-12, -4.8]], ['coi-2', 6, [-10, -4.5]], ['coi-3', 21, [-8, -4.8]]].forEach(([id, v, a]) => person(id, v, a, { yaw: 0, pose: 'stand' }));
  b.cmd('set_pose', { id: 'coi-2', t: 158, pose: 'point' });

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
  const street = ['rcr-n0', 'sh-e-n-0', 'sh-w-n-0'];
  chapter('c1', 0, 12, 'A quiet evening', '', 'Race Course Road in Little India, Singapore. The evening of 8 December 2013. Shophouses line the street and people walk home. The layout here is approximate.', ['w1', 'w2'], 'wide', 'estimated: scene of an ordinary evening, not a recorded event', true,
    [{ t: 0, shot: 'wide', frame: street }, { t: 7, shot: 'medium', frame: ['w1', 'w3', 'chat1', 'chat2'] }]);
  chapter('c2', 12, 24, 'A worker leaves a bus', '', 'A private bus stops by the bus stop and a worker steps off. This is a typical scene, not a recorded one. The details are approximate.', ['bus1', 'busstop'], 'medium', 'estimated: illustrative scene', true,
    [{ t: 12, shot: 'medium', frame: ['bus1', 'busstop'] }, { t: 18.5, shot: 'close', frame: ['worker'] }]);
  chapter('c3', 24, 36, 'The accident', '21:21', 'At about 21:21 a private bus hit a pedestrian on Race Course Road, near Tekka Lane. The pedestrian died. Positions here are approximate.', ['ped'], 'wide', WIKI, false,
    [{ t: 24, shot: 'wide', frame: ['ped', 'zebra'] }, { t: 29.5, shot: 'medium', frame: ['ped', 'bus2'] }]);
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
    [{ t: 96, shot: 'close', frame: ['driver', 'timekeeper'] }, { t: 102, shot: 'medium', frame: ['driver', 'timekeeper', 'pol-1', 'pol-2'] }]);
  chapter('c10', 108, 120, 'Vehicles overturned and burnt', '22:20', 'From 22:20 to 22:40 rioters flipped six vehicles and set four on fire. The scene shows only a few of them.', ['pc1', 'amb'], 'wide', WIKI, false,
    [{ t: 108, shot: 'wide', frame: ['pc1', 'pc2', 'amb'] }, { t: 114, shot: 'orbit', frame: ['pc1-after', 'pc2-after', 'amb-after', 'fl-1', 'fl-2'], view: 10 }]);
  chapter('c11', 120, 132, 'Special Operations Command', '22:50', 'At 22:50 the Special Operations Command arrived. Many rioters had surrendered and the crowd had become smaller.', ['soc-1'], 'medium', WIKI, false,
    [{ t: 120, shot: 'medium', frame: ['soc-1', 'soc-2', 'soc-3'] }, { t: 126, shot: 'wide', frame: [...soc, ...cops] }]);
  chapter('c12', 132, 144, 'The crowd disperses', '23:30', 'By 23:30 all the rioters had dispersed from Race Course Road and the streets nearby.', ['ped'], 'top', WIKI, false,
    [{ t: 132, shot: 'top', frame: ['ped', ...crowd.slice(0, 20)] }]);
  chapter('c13', 144, 156, 'The next morning', '06:45', 'In all, 62 people were hurt: 37 police officers, 12 SCDF officers, 5 Certis officers and 8 civilians. Race Course Road fully reopened at 06:45.', ['pc1-after'], 'wide', WIKI, false,
    [{ t: 144, shot: 'wide', frame: ['pc1-after', 'pc2-after', 'amb-after', 'clean-1', 'clean-2', 'clean-3'] }]);
  chapter('c14', 156, 168, 'Committee of Inquiry', '', 'A Committee of Inquiry was appointed on 13 December 2013. It reported on 27 June 2014. It ruled out racial and labour issues as causes.', ['coi-sign'], 'medium', WIKI, false,
    [{ t: 156, shot: 'medium', frame: ['coi-sign', 'coi-1', 'coi-2', 'coi-3'] }]);
  return finish(b, 'riot');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) { const rep = build(); printReport(rep); process.exit(rep.ok ? 0 : 1); }
