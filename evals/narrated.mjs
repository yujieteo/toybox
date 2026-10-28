// Eval case 3: a short narrated scene about a zebra crossing. It shows the narration tools: an
// outline of facts with their sources, a local voice that sets the beats, motion words on cues of
// the narration, the narrator and a label with raised text. The script uses only the tool commands.
// Run it directly to make the voice files that are missing (the first run installs the voice):
//   node evals/narrated.mjs
import { fileURLToPath } from 'node:url';
import { Builder, finish, printReport, OUT_DIR } from './lib.mjs';
import { cueTime } from '../core/narration.mjs';

const WIKI = 'https://en.wikipedia.org/wiki/Zebra_crossing';
const E = { estimated: true, source: 'estimated' };

export const SENTENCES = [
  { text: 'This is a zebra crossing.', facts: ['stripes'] },
  { text: 'White stripes mark it on the road.', facts: ['stripes'] },
  'A person steps onto the crossing.',
  { text: 'In the United Kingdom, a driver must then give way.', facts: ['give-way'] },
  { text: 'The car stops, and the person walks across.', pause: 2.6 },
  'The car goes on when the road is clear.',
  { text: 'The first zebra crossing opened in Slough on 31 October 1951.', facts: ['first'] },
];

export function build() {
  const b = new Builder({ title: 'The zebra crossing', author: 'Toybox eval', ground: 'street', look: 'day', size: [60, 90] });
  const cmd = (t, a) => b.cmd(t, a, { sceneDir: OUT_DIR });
  const at = (cue) => cueTime(b.scene.narration, cue);

  // the outline: only facts that the source gives
  cmd('add_fact', { id: 'stripes', text: 'A zebra crossing is a pedestrian crossing marked with white stripes.', source: WIKI });
  cmd('add_fact', { id: 'give-way', text: 'In the United Kingdom, road traffic must give way when a pedestrian has moved onto a zebra crossing (the Highway Code).', source: WIKI });
  cmd('add_fact', { id: 'first', text: 'The first zebra crossing was introduced on Slough High Street on 31 October 1951.', source: WIKI });
  cmd('narrate', { sentences: SENTENCES });
  cmd('make_voice', {});

  // the set: a road along z with the crossing at z = 0. Traffic keeps left.
  cmd('place', { model: 'road-zebra', at: [0, 0], id: 'zebra', ...E });
  for (const z of [-26.5, -16.5, -6.5, 6.5, 16.5, 26.5, 36.5]) cmd('place', { model: 'road-straight', at: [0, z], ...E });
  cmd('place', { model: 'narrator', at: [-6.5, -3], id: 'narrator', source: 'The narrator of this video. It is not a fact.' });
  cmd('place', { model: 'person', at: [5.5, 0], yaw: 270, variant: 4, id: 'p1', ...E });
  cmd('place', { model: 'car-sedan', at: [-2, 40], yaw: 180, id: 'car', ...E });

  // the person steps onto the crossing, waits, then walks across
  cmd('move_along', { id: 'p1', path: [[5.5, 0], [3.5, 0]], cue: [2, 'steps'], times: [0, 1.4] });
  const across = cmd('move_along', { id: 'p1', path: [[3.5, 0], [-4.6, 0]], speed: 2, cue: [4, 'walks'] });
  // the car comes, stops before the crossing, and goes on when the person is on the far side
  const stop = at([4, 'stops']), go = Math.max(at([5, 'goes']), across.end + 0.5);
  cmd('move_along', { id: 'car', path: [[-2, 40], [-2, 5]], times: [0, stop] });
  cmd('move_along', { id: 'car', path: [[-2, 5], [-2, -40]], times: [go, go + 9] });

  // the narrator: motion words on the words of the narration
  cmd('add_motion', { id: 'narrator', move: 'pop', cue: [0] });
  cmd('add_motion', { id: 'narrator', move: 'look', cue: [0, 'zebra'], d: 1.6, x: 1 });
  cmd('add_motion', { id: 'narrator', move: 'squint', cue: [1, 'White'], d: 1 });
  cmd('add_motion', { id: 'narrator', move: 'look', cue: [2, 'person'], d: 1.8, x: 1, y: 0.3 });
  cmd('add_motion', { id: 'narrator', move: 'hop', cue: [3, 'give way'] });
  cmd('add_motion', { id: 'narrator', move: 'squash', cue: [4, 'stops'] });
  cmd('add_motion', { id: 'narrator', move: 'glance', cue: [5, 'clear'] });
  cmd('add_motion', { id: 'narrator', move: 'spin', cue: [6, 'first'] });
  cmd('add_motion', { id: 'narrator', move: 'wave', cue: [6, '1951'] });

  // 2 chapters: the crossing, then its history
  const length = b.scene.captions.at(-1).end;
  cmd('add_chapter', { id: 'c1', cue: [0], end_cue: [6], title: 'The zebra crossing', focus: ['zebra', 'narrator', 'p1'], shot: 'wide', source: WIKI });
  cmd('add_chapter', { id: 'c2', cue: [6], end: length, title: 'The first one', focus: ['narrator'], shot: 'close', source: WIKI });
  cmd('add_callout', { cue: [6, '31'], end: length, text: '31^{st} October 1951', object: 'narrator', source: WIKI });
  cmd('set_camera', { t: 0, shot: 'wide', frame: ['zebra', 'narrator', 'p1'], view: 25, elevation: 22 });
  cmd('set_camera', { cue: [3], shot: 'wide', frame: ['zebra', 'narrator', 'p1'], view: 35, elevation: 18 });
  cmd('set_camera', { cue: [6], shot: 'close', frame: ['narrator'], view: 10, margin: 2.4, cut: true });
  cmd('set_camera', { t: length, shot: 'close', frame: ['narrator'], view: 0, margin: 2.4 });
  return finish(b, 'narrated', { fullPeople: false });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { makeVoices } = await import('../core/voice.mjs');
  await makeVoices(OUT_DIR, SENTENCES.map((s) => s.text ?? s));
  printReport(build());
}
