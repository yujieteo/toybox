// Eval case 4: how to board a Singapore MRT train, from the fare gate to the closing doors.
// The commuter taps in, walks to the platform, queues behind the yellow line, lets the passengers
// alight, minds the platform gap, boards and stands clear while the doors close. The set is a
// Singapore underground platform: a train car, full-height platform screen doors, the yellow line
// and tactile strip, a station wall and a fare gate.
// The script uses only the tool commands. Run it directly to make the voice files that are missing
// (the first run installs the voice on this computer):
//   node evals/mrt.mjs
import { fileURLToPath } from 'node:url';
import { Builder, finish, printReport } from './lib.mjs';
import { cueTime } from '../core/narration.mjs';

export const DEMO_DIR = fileURLToPath(new URL('../web/scenes/mrt/', import.meta.url));

// The public pages that the facts were read from. Only facts from these pages are in the outline.
const WIKI_MRT = 'https://en.wikipedia.org/wiki/Mass_Rapid_Transit_(Singapore)';
const WIKI_SAFETY = 'https://en.wikipedia.org/wiki/Safety_on_the_Mass_Rapid_Transit_(Singapore)';
const WIKI_FARES = 'https://en.wikipedia.org/wiki/Fares_and_ticketing_on_the_Mass_Rapid_Transit_(Singapore)';
const WIKI_GAP = 'https://en.wikipedia.org/wiki/Mind_the_gap';
const WIKI_ANNOUNCE = 'https://en.wikipedia.org/wiki/Train_station_announcement';
const LTA_GRACIOUS = 'https://www.lta.gov.sg/content/ltagov/en/getting_around/public_transport/a_better_public_transport_experience/gracious_commuting.html';
const LTA_RAIL = 'https://www.lta.gov.sg/content/ltagov/en/getting_around/public_transport/rail_network.html';

export const SENTENCES = [
  { text: 'The station is split into paid and unpaid areas, and the fare gates are the only way in.', facts: ['paid-area'] },
  { text: 'Tap in with a card or a phone, and the fare runs to the tap out at the end.', facts: ['tap'] },
  { text: "Glass screen doors line the track: Singapore's MRT was the first in Asia to use them, back in 1987.", facts: ['psd-first'] },
  { text: 'They are full height underground and half height at elevated stations, and by 14 March 2012 every elevated station had them.', facts: ['psd-types', 'psd-2012'] },
  { text: 'Queue to one side of the door, behind the yellow line.', facts: ['give-way'], pause: 1.0 },
  { text: 'The train arrives, and the platform doors open with it.', pause: 1.4 },
  { text: 'The announcement asks you to mind the platform gap, and important MRT announcements are made in four languages.', facts: ['mind-gap', 'announcements'], pause: 0.8 },
  { text: 'Let the passengers alight first.', facts: ['give-way'], pause: 0.8 },
  { text: 'Then move in, so the people behind you can board.', facts: ['move-in'] },
  { text: 'The doors close, and the MRT carries on: more than 140 stations on six lines, and over three million rides a day.', facts: ['network'] },
];

// The layout is a typical Singapore underground station platform. The sizes and positions are an
// estimate: no public source gives the plan of a particular station.
const E = { estimated: true, source: 'estimated: station layout and positions are approximate' };
const EP = { estimated: true, source: 'estimated: full-height platform screen doors, as at an underground station; positions and sizes are approximate' };
const PERSON = { estimated: true, source: 'estimated: a typical commuter; faces are generic' };

export function build() {
  const b = new Builder({ title: 'How to board an MRT train', author: 'Toybox eval', ground: 'floor', look: 'indoor', size: [110, 80], color: '#a9a49a' });
  const cmd = (t, a) => b.cmd(t, a, { sceneDir: DEMO_DIR });
  const at = (cue) => cueTime(b.scene.narration, cue);

  // ---------- the outline: only facts that a public page gives
  cmd('add_fact', { id: 'paid-area', text: 'Stations are divided into two areas, paid and unpaid, which collect fares by restricting entry only through the fare gates (access control gates).', source: WIKI_MRT });
  cmd('add_fact', { id: 'tap', text: 'Fares are charged based on commuters "tapping in" at the start and "tapping out" at the destination; the failure to tap out generally results in full or flat fare(s).', source: WIKI_FARES });
  cmd('add_fact', { id: 'psd-first', text: 'The Singapore MRT was the first rapid transit system in Asia to incorporate glass platform screen doors, in its underground stations in 1987.', source: WIKI_SAFETY });
  cmd('add_fact', { id: 'psd-types', text: 'Full-height platform screen doors are installed at all existing underground MRT and sub-surface stations in Singapore; half-height platform screen doors are installed at elevated stations.', source: WIKI_SAFETY });
  cmd('add_fact', { id: 'psd-2012', text: 'By 14 March 2012, all elevated MRT stations had been retrofitted with half-height platform screen doors and were operational.', source: WIKI_MRT });
  cmd('add_fact', { id: 'give-way', text: "LTA's Thoughtful Bunch campaign asks commuters to queue to one side of the door and let others alight first.", source: LTA_GRACIOUS });
  cmd('add_fact', { id: 'move-in', text: 'The same LTA campaign asks commuters to move in to make space so others can board.', source: LTA_GRACIOUS });
  cmd('add_fact', { id: 'mind-gap', text: "On Singapore's MRT, the phrases \"Please mind the platform gap\" and \"Please mind the gap\" are used in announcements in English.", source: WIKI_GAP });
  cmd('add_fact', { id: 'announcements', text: "In Singapore's MRT, important train announcements are made in the four official languages.", source: WIKI_ANNOUNCE });
  cmd('add_fact', { id: 'network', text: 'Today more than 140 stations across six MRT lines span the island, a 200 km system with over three million daily ridership, run by SMRT and SBS Transit.', source: LTA_RAIL });
  cmd('narrate', { sentences: SENTENCES });
  cmd('make_voice', {});
  const LEN = b.scene.captions.at(-1).end;

  // short credit lines: the viewer draws each line on one line, and the demo page lists every source
  cmd('add_credit', { text: 'Fact sources: Wikipedia.' });
  cmd('add_credit', { text: 'Fact sources: Land Transport Authority (LTA).' });
  cmd('add_credit', { text: 'Layout, train and crowd are approximate. Faces are generic.' });

  // ---------- the platform: x is along the platform, z points south from the platform edge (z = -2)
  const place = (model, p, extra = {}) => cmd('place', { model, at: p, ...E, ...extra });
  // the floor the visitor walks on (tag floor: a surface, not a wall)
  place('floor-tile', [-13, 0, 2.25], { id: 'platform-w', scale: [13, 1, 4.25], tags: ['floor'], colors: { floor: '#cdc6b6' } });
  place('floor-tile', [13, 0, 2.25], { id: 'platform-e', scale: [13, 1, 4.25], tags: ['floor'], colors: { floor: '#cdc6b6' } });
  place('floor-tile', [0, 0, 9.5], { id: 'concourse', scale: [10, 1, 3], tags: ['floor'], colors: { floor: '#c6c0b2' } });
  // the track and the station wall behind it
  for (const x of [-36, -12, 12, 36]) place('mrt-track', [x, 0, -4.2], { id: `track-${x}`, colors: { asphalt: '#4d5157' } });
  for (let i = -4; i <= 4; i++) place('station-wall', [i * 5, 0, -8.6], { id: `wall-${i + 5}`, colors: { wall: '#e2dccc' } });
  // the platform edge: yellow line and tactile strip, 4 m at a time
  for (let i = -6; i <= 6; i++) place('platform-edge-strip', [i * 4, 0, -1.55], { id: `edge-${i}`, tags: ['floor'] });
  // full-height platform screen doors: five bays, a leaf on each side of each door
  const BAYS = [-14.4, -7.2, 0, 7.2, 14.4];
  BAYS.forEach((x, i) => {
    const bay = `psd-${i + 1}`;
    place('psd-bay', [x, 0, -2], { id: bay, tags: ['floor'], ...EP });
    for (const side of [-1, 1]) place('psd-leaf', [x + side * 0.38, 0, -1.85], { id: `${bay}-leaf-${side < 0 ? 'l' : 'r'}`, tags: ['floor'], ...EP });
  });
  // fixed screen wall between the door bays, so the platform edge is enclosed
  for (const x of [-10.8, -3.6, 3.6, 10.8]) place('psd-panel', [x, 0, -2], { id: `psd-panel-${x}`, tags: ['floor'], ...EP });
  // the train car. It waits west of the station and stops with its middle door at x = 0.
  // It is tagged floor, so the people and the camera may go inside it.
  place('mrt-train-car', [-34, 0, -3.8], { id: 'train', yaw: 90, tags: ['floor'], colors: { train: '#d8dcdf', stripe: '#b5483c' } });
  for (const dx of [0, 7.2, -7.2]) for (const side of [-1, 1]) {
    place('mrt-train-door-leaf', [dx + side * 0.43, 0, -2.16], { id: `train-leaf-${dx}-${side < 0 ? 'l' : 'r'}`, tags: ['floor'] });
  }
  // the fare gate at the concourse: three passages, six pedestals
  for (let i = 0; i < 6; i++) place('fare-gate', [-2.5 + i, 0, 8], { id: `gate-${i + 1}`, yaw: 0 });
  // a sign and two benches
  cmd('place_sign', { text: 'Please mind the platform gap', at: [2.6, 0, -1.85], model: 'sign', ...E, id: 'gap-sign' });
  place('bench', [-4, 0, 4.6], { id: 'bench-w' }); place('bench', [5.2, 0, 4.6], { id: 'bench-e' });
  place('bin', [-1.6, 0, 6.4], { id: 'bin-w' }); place('bin', [3.2, 0, 6.8], { id: 'bin-e' });
  place('notice-board', [-8.5, 0, 6.2], { id: 'board', label: 'Station map' });

  // ---------- the commuter who boards, and the crowd around the door (variants are fixed)
  const person = (id, variant, p, extra = {}) => cmd('place', { model: 'person', at: [p[0], 0.02, p[1]], id, variant, ...PERSON, ...extra });
  person('main', 8, [0, 11.8], { yaw: 180, colors: { shirt: '#3f6e9a', pants: '#3a3f47' } });
  person('waiter-a', 2, [-2.4, -0.2], { yaw: 180, pose: 'stand', colors: { shirt: '#c8553d', pants: '#3a3f47' } });
  person('waiter-b', 5, [3.4, -0.6], { yaw: 170, pose: 'stand', colors: { shirt: '#6f9a6a', pants: '#4a5568' } });
  person('waiter-c', 11, [-4.6, 1.2], { yaw: 160, pose: 'stand', colors: { shirt: '#a99bb8', pants: '#2f4a6b' } });
  person('pointing', 9, [3.4, 0.6], { yaw: 210, pose: 'point', colors: { shirt: '#e8dcc0', pants: '#55595f' } });
  person('waving', 14, [-3.2, 2.2], { yaw: 150, pose: 'wave', colors: { shirt: '#5f9ea0', pants: '#3a3f47' } });
  person('cheering', 3, [4.9, 2.4], { yaw: 190, pose: 'cheer', colors: { shirt: '#d9b44a', pants: '#6b5b4b' } });
  person('bending', 21, [5.6, 3.4], { yaw: 300, pose: 'bend', colors: { shirt: '#b8765f', pants: '#3a3f47' } });
  person('sitter-w', 6, [-4.0, 4.6], { yaw: 0, pose: 'sit', colors: { shirt: '#4a79a5', pants: '#2f4a6b' } });
  person('sitter-e', 18, [5.2, 4.6], { yaw: 0, pose: 'sit', colors: { shirt: '#8c8c86', pants: '#55595f' } });
  person('walker-w', 7, [-6, 5.8], { yaw: 270, pose: 'walk', colors: { shirt: '#6f9a6a', pants: '#3a3f47' } });
  person('walker-e', 12, [10, 5.2], { yaw: 90, pose: 'walk', colors: { shirt: '#a99bb8', pants: '#4a5568' } });
  person('runner', 4, [14, 5.6], { yaw: 180, pose: 'run', colors: { shirt: '#d98a3d', pants: '#3a3f47' } });
  person('alight-1', 13, [-0.4, -3.3], { yaw: 0, pose: 'stand', colors: { shirt: '#c8553d', pants: '#55595f' } });
  person('alight-2', 16, [0.4, -3.6], { yaw: 0, pose: 'stand', colors: { shirt: '#3f6e9a', pants: '#6b5b4b' } });
  person('alight-3', 20, [-0.1, -4.3], { yaw: 0, pose: 'stand', colors: { shirt: '#6f9a6a', pants: '#4a5568' } });
  person('carrier', 17, [-7.2, 0.4], { yaw: 120, pose: 'stand', colors: { shirt: '#e8dcc0', pants: '#3a3f47' } });
  person('child', 10, [2.4, 3.2], { yaw: 180, pose: 'stand', colors: { shirt: '#d9b44a', pants: '#4a5568' } });

  // ---------- the commuter walks in, taps in and walks to the queue behind the line
  cmd('move_along', { id: 'main', path: [[0, 11.8], [0, 9.1]], times: [0, 2.1], cue: [0], pose: 'walk', end_pose: 'stand' });
  cmd('move_along', { id: 'main', path: [[0, 9.1], [0, 8.0], [0, 6.4], [1.1, 2.4], [1.1, -1.05]], times: [0, 0.9, 2.2, 5.8, 8.6], cue: [1, 'Tap', 0.5], pose: 'walk', end_pose: 'stand' });
  // the late commuter runs up to the edge, and two people walk off along the platform
  cmd('move_along', { id: 'runner', path: [[14, 5.6], [14, -0.9]], cue: [4, 'Queue', 0.3], speed: 3.6, pose: 'run', end_pose: 'stand' });
  cmd('move_along', { id: 'walker-w', path: [[-6, 5.8], [-24, 5.8]], start: 0.5, speed: 0.9, pose: 'walk', end_pose: 'stand' });
  cmd('move_along', { id: 'walker-e', path: [[10, 5.2], [24, 5.2]], start: 0.5, speed: 0.9, pose: 'walk', end_pose: 'stand' });

  // ---------- the train arrives during the queue chapter, then the doors open
  cmd('animate', { id: 'train', channel: 'at', keys: [
    { t: 0, v: [-34, 0, -3.8] },
    { cue: [4], v: [-34, 0, -3.8], ease: 'inout' },
    { cue: [5, 'arrives'], v: [0, 0, -3.8], ease: 'inout' },
  ] });
  // the platform screen door and the train door leaves slide open, and close again at the end
  for (const leaf of ['psd-3-leaf-l', 'psd-3-leaf-r', 'train-leaf-0-l', 'train-leaf-0-r']) {
    const left = leaf.endsWith('-l');
    const closed = left ? -0.38 : 0.38, open = left ? -1.0 : 1.0;
    const z = leaf.startsWith('psd') ? -1.85 : -2.16;
    cmd('animate', { id: leaf, channel: 'at', keys: [
      { t: 0, v: [closed, 0, z], ease: 'step' },
      { cue: [5, 'open', -1.0], v: [closed, 0, z], ease: 'linear' },
      { cue: [5, 'open', 0.5], v: [open, 0, z], ease: 'step' },
      { cue: [9, 'doors', -0.3], v: [open, 0, z], ease: 'linear' },
      { cue: [9, 'close', 0.8], v: [closed, 0, z], ease: 'step' },
    ] });
  }
  // the passengers inside alight first and walk away along the platform
  cmd('move_along', { id: 'alight-1', path: [[-0.4, -3.3], [-0.6, -2.0], [-1.6, -1.2], [-4.0, -1.15], [-7.5, -1.15], [-8.0, 0.5], [-9.2, 2.8], [-11.0, 4.2]], cue: [6, 'gap', -1.0], speed: 1.15, pose: 'walk', end_pose: 'stand' });
  cmd('move_along', { id: 'alight-2', path: [[0.4, -3.6], [0.3, -2.0], [-0.6, -1.3], [-3.0, -1.15], [-8.5, -1.15], [-8.7, 0.4], [-9.8, 2.6], [-13.0, 4.4]], cue: [6, 'gap', 0.4], speed: 1.15, pose: 'walk', end_pose: 'stand' });
  cmd('move_along', { id: 'alight-3', path: [[-0.1, -4.3], [-0.2, -2.0], [-1.2, -1.2], [-3.6, -1.15], [-8.0, -1.15], [-9.0, 0.9], [-11.5, 3.0]], cue: [7, 'passengers'], speed: 1.2, pose: 'walk', end_pose: 'stand' });
  // then the waiting commuter steps through the open doors and stands clear inside the car
  cmd('move_along', { id: 'main', path: [[1.1, -1.05], [0.7, -1.25], [0.35, -2.0], [0.15, -2.4], [0, -3.2]], times: [0, 0.6, 1.4, 1.9, 3.0], cue: [8, 'move'], pose: 'walk', end_pose: 'stand' });

  // ---------- chapters: one step of boarding for each chapter, and one beat of the narration for
  // each sentence. The page lists every chapter as a step of "How to board", so the facts about the
  // screen doors share the one step: the screen-door chapter spans sentences 3 and 4.
  const STEPS = [
    { id: 'c1', title: 'The fare gate', from: 0, to: 1, focus: ['main', 'gate-3', 'gate-4'], shot: 'medium', source: WIKI_MRT, measured: true },
    { id: 'c2', title: 'Tap in', from: 1, to: 2, focus: ['main', 'gate-4'], shot: 'close', source: WIKI_FARES, measured: true },
    { id: 'c3', title: 'The screen doors', from: 2, to: 4, focus: ['main', 'psd-3', 'psd-2', 'psd-4'], shot: 'wide', source: `${WIKI_SAFETY} ; ${WIKI_MRT}`, measured: true },
    { id: 'c4', title: 'Behind the line', from: 4, to: 5, focus: ['main', 'waiter-b', 'psd-3'], shot: 'medium', source: LTA_GRACIOUS, measured: true },
    { id: 'c5', title: 'The train arrives', from: 5, to: 6, focus: ['train', 'main', 'psd-3'], shot: 'wide', source: 'estimated: staging of a typical weekday morning boarding', estimated: true },
    { id: 'c6', title: 'Mind the gap', from: 6, to: 7, focus: ['main', 'psd-3'], shot: 'close', source: WIKI_GAP, measured: true },
    { id: 'c7', title: 'Let them alight', from: 7, to: 8, focus: ['alight-3', 'main', 'psd-3'], shot: 'medium', source: LTA_GRACIOUS, measured: true },
    { id: 'c8', title: 'Board and move in', from: 8, to: 9, focus: ['main', 'psd-3'], shot: 'follow', source: LTA_GRACIOUS, measured: true },
    { id: 'c9', title: 'The doors close', from: 9, to: null, focus: ['main', 'psd-3', 'psd-2'], shot: 'close', source: LTA_RAIL, measured: true },
  ];
  STEPS.forEach((s) => cmd('add_chapter', {
    id: s.id, cue: [s.from], ...(s.to === null ? { end: LEN } : { end_cue: [s.to] }),
    title: s.title, clock: '08:12', focus: s.focus, shot: s.shot,
    source: s.source, ...(s.measured ? { measured: true } : { estimated: true }),
  }));
  const start = (i) => at([STEPS[i].from]), end = (i) => (STEPS[i].to === null ? LEN : at([STEPS[i].to]));

  // The camera keys. A key with cut true holds the old shot and cuts; the hold key of the same shot
  // lets the camera drift with the people inside the chapter.
  const cam = (i, t0, shot, frame, opts = {}) => {
    cmd('set_camera', { t: t0, shot, frame, ...opts, ...(i > 0 ? { cut: true } : {}) });
    const hold = Math.min(end(i) - 0.45, LEN - 0.25);
    if (hold > t0 + 0.2) cmd('set_camera', { t: hold, shot, frame, ...opts });
  };
  cam(0, start(0), 'medium', ['main', 'gate-3', 'gate-4'], { view: 25, elevation: 16, margin: 1.35 });
  cam(1, start(1), 'close', ['main', 'gate-4'], { view: 35, elevation: 8, margin: 1.7 });
  // the screen-door chapter runs over two sentences: a wide establishing shot, then a medium shot
  cmd('set_camera', { t: start(2), shot: 'wide', frame: ['main', 'psd-3', 'psd-2', 'psd-4'], view: 0, elevation: 22, cut: true });
  cmd('set_camera', { t: at([3]), shot: 'medium', frame: ['main', 'psd-2', 'psd-3'], view: 8, elevation: 14, margin: 1.4, cut: true });
  const holdC3 = Math.min(end(2) - 0.45, LEN - 0.25);
  if (holdC3 > at([3]) + 0.2) cmd('set_camera', { t: holdC3, shot: 'medium', frame: ['main', 'psd-2', 'psd-3'], view: 8, elevation: 14, margin: 1.4 });
  cam(3, start(3), 'medium', ['main', 'waiter-b', 'psd-3'], { view: 350, elevation: 14, margin: 1.3 });
  cam(4, start(4), 'wide', ['train', 'main', 'psd-3'], { view: 25, elevation: 18 });
  cam(5, start(5), 'close', ['main', 'psd-3'], { view: 12, elevation: 8, margin: 1.6 });
  cam(6, start(6), 'medium', ['alight-3', 'main', 'psd-3'], { view: 8, elevation: 10, margin: 1.4 });
  cam(7, start(7), 'follow', ['main'], {});
  cmd('set_camera', { t: start(8), shot: 'close', frame: ['main', 'psd-3'], view: 10, elevation: 8, margin: 1.8, cut: true });
  cmd('set_camera', { t: Math.min(start(8) + 2.4, LEN - 0.3), shot: 'close', frame: ['psd-2', 'psd-3', 'psd-4', 'main'], view: 6, elevation: 12, margin: 1.3 });

  // two callouts: the tap at the gate and the gap at the platform edge
  cmd('add_callout', { cue: [1, 'Tap'], end_cue: [1, 'phone'], text: 'Tap in here', object: 'gate-4', source: WIKI_FARES, measured: true });
  cmd('add_callout', { cue: [6, 'gap'], end_cue: [7], text: 'Please mind the platform gap', object: 'main', source: WIKI_GAP, measured: true });

  return finish(b, 'mrt', { dir: DEMO_DIR });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { makeVoices } = await import('../core/voice.mjs');
  await makeVoices(DEMO_DIR, SENTENCES.map((s) => s.text ?? s));
  printReport(build());
}
