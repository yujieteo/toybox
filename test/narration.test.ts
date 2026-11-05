import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { newScene, validate, srt } from '../core/scene.ts';
import { runTool } from '../core/commands.ts';
import { timeline, cueTime, LEAD, GAP, TAIL, STAND_IN } from '../core/narration.ts';
import { voiceFile } from '../core/voice.ts';
import { MOVES, poseAt, marks, plain } from '../web/vid.js';
import type { Scene, Cue, NarrationBeat, Motion } from '../web/types.ts';
import { must, okResult, firstError, errorsOf, isOk, view } from './helpers.ts';

type Sentence = string | NarrationBeat | [string, number];

const OUT = fileURLToPath(new URL('../evals/out', import.meta.url));
const codes = (s: Scene): string[] => validate(s).map((e) => e.code);
// The narration, the motions and a track of a scene. They are optional in the type.
const narrationOf = (s: Scene): NarrationBeat[] => must(s.narration, 'narration');
const motionsOf = (s: Scene): Motion[] => must(s.motions, 'motions');
const beat = (s: Scene, i: number): NarrationBeat => must(narrationOf(s)[i], `sentence ${i}`);
const run = (s: Scene, tool: string, args: unknown, ctx: object = {}) => runTool(s, tool, args, ctx);
function narrated(sentences: Sentence[] = ['One two three.', ['Four five.', 1]]): Scene {
  const s = newScene({});
  assert.ok(isOk(run(s, 'narrate', { sentences: sentences.map((x) => (Array.isArray(x) ? { text: x[0], pause: x[1] } : x)) })));
  assert.ok(isOk(run(s, 'place', { model: 'narrator', at: [0, 0], id: 'n' })));
  return s;
}

function tests1(): void {
test('timeline: 1 sentence = 1 beat, with lead, gap, pause and tail', () => {
  const n: NarrationBeat[] = [{ text: 'a', seconds: 2 }, { text: 'b', seconds: 1, pause: 0.5 }];
  const length = timeline(n);
  const n0 = must(n[0]), n1 = must(n[1]);
  assert.deepEqual([n0.start, n0.end], [LEAD, LEAD + 2]);
  assert.equal(n1.start, LEAD + 2 + GAP);
  assert.equal(length, Math.round((must(n1.end) + 0.5 + TAIL) * 1000) / 1000);
  assert.equal(cueTime(n, [1]), n1.start);
  assert.throws(() => cueTime(n, [2]), /does not exist/);
  assert.throws(() => cueTime(n, [0, 'zzz']), /is not in sentence/);
});

test('narrate: stand-in times, a caption for each sentence, and voice_missing until make_voice', () => {
  const s = narrated();
  assert.equal(beat(s, 0).seconds, Math.round(STAND_IN * 'One two three.'.length * 1000) / 1000);
  assert.deepEqual(s.captions.map((c) => c.text), ['One two three.', 'Four five.']);
  const [c0, c1] = [must(s.captions[0]), must(s.captions[1])];
  assert.equal(c0.end, c1.start);
  assert.ok(s.duration >= c1.end);
  assert.deepEqual(codes(s), ['voice_missing']);
  assert.match(srt(s), /One two three\./);
  assert.equal(firstError(run(s, 'add_caption', { start: 0, end: 5, text: 'x' })).code, 'narrated');
});

test('a cue follows the narration when the narration changes', () => {
  const s = narrated();
  const r = run(s, 'add_motion', { id: 'n', move: 'hop', cue: [1, 'five'] });
  assert.ok(isOk(r), JSON.stringify(r));
  assert.equal(must(motionsOf(s)[0]).t, cueTime(narrationOf(s), [1, 'five']));
  assert.ok(isOk(run(s, 'narrate', { sentences: ['A much longer first sentence than before.', 'Four five.'] })));
  assert.equal(must(motionsOf(s)[0]).t, cueTime(narrationOf(s), [1, 'five']));
  assert.ok(isOk(run(s, 'set_camera', { cue: [0, 'longer'], shot: 'wide', eye: [0, 5, 10], target: [0, 1, 0] })));
  assert.equal(must(s.camera[0]).t, cueTime(narrationOf(s), [0, 'longer']));
  // a cue that names a word that the narration does not say fails, and the scene does not change
  const before = JSON.stringify(s);
  assert.equal(firstError(run(s, 'add_motion', { id: 'n', move: 'pop', cue: [0, 'banana'] })).code, 'bad_cue');
  assert.equal(firstError(run(s, 'narrate', { sentences: ['Only this.'] })).code, 'bad_cue');
  assert.equal(JSON.stringify(s), before);
});
}
tests1();

function tests2(): void {
test('move_along, animate, set_lighting and a framed camera follow their cue words when the narration changes', () => {
  const s = narrated(['One two three.', 'Four five six seven.']);
  assert.ok(isOk(run(s, 'place', { model: 'person', at: [4, 0], id: 'p' })));
  assert.ok(isOk(run(s, 'move_along', { id: 'p', path: [[4, 0], [4, 3]], cue: [1, 'five'], times: [0, 1.5] })));
  assert.ok(isOk(run(s, 'animate', { id: 'n', channel: 'yaw', keys: [{ t: 0, v: 0 }, { cue: [0, 'three'], v: 90 }] })));
  assert.ok(isOk(run(s, 'set_lighting', { cue: [1, 'six'], look: 'dusk' })));
  assert.ok(isOk(run(s, 'set_camera', { t: 3, shot: 'medium', frame: ['p'] })));
  assert.ok(isOk(run(s, 'set_camera', { cue: [1, 'seven'], shot: 'medium', frame: ['p'] })));
  const eye3 = must(s.camera[0]).eye;
  const r = run(s, 'narrate', { sentences: ['A much longer first sentence: one two three.', 'Four five six seven.'] });
  assert.ok(isOk(r), JSON.stringify(r));
  const at = (cue: Cue) => cueTime(narrationOf(s), cue), track = (id: string, ch: string) => must(s.tracks.find((t) => t.object === id && t.channel === ch)).keys;
  const walk = at([1, 'five']);
  assert.deepEqual(track('p', 'at').map((k) => k.t), [walk, walk + 1.5].map((v) => Math.round(v * 1000) / 1000));
  assert.deepEqual(track('p', 'pose').filter((k) => k.cue).map((k) => k.t), track('p', 'at').map((k) => k.t));
  assert.equal(must(track('n', 'yaw')[1]).t, at([0, 'three']));
  assert.equal(must(must(s.lighting).find((k) => k.look === 'dusk')).t, at([1, 'six']));
  assert.equal(must(s.camera[1]).t, at([1, 'seven']));
  assert.notDeepEqual(must(s.camera[0]).eye, eye3, 'the person is at another place at 3 s now');
  for (const cam of s.camera) {
    const fresh: Scene = Object.assign(newScene({}), structuredClone(s), { camera: [] });
    assert.ok(isOk(run(fresh, 'set_camera', { t: cam.t, shot: 'medium', frame: ['p'] })));
    const framed = must(fresh.camera[0]);
    assert.deepEqual([cam.eye, cam.target], [framed.eye, framed.target]);
  }
  assert.ok(!codes(s).includes('narration_timing'), JSON.stringify(validate(s)));
});

test('a cue needs a text word and a number offset', () => {
  const s = narrated();
  const n = narrationOf(s);
  // A bad cue is a bad value on purpose: it enters through the JSON boundary.
  const bad1 = view<Cue>([1, 'Four', '1']), bad2 = view<Cue>([1, 5]);
  assert.throws(() => cueTime(n, bad1), /^Error: Cue /);
  assert.throws(() => cueTime(n, bad2), /^Error: Cue /);
  assert.equal(firstError(run(s, 'add_motion', { id: 'n', move: 'hop', cue: [1, 'Four', '1'] })).code, 'bad_cue');
  s.motions = [{ object: 'n', move: 'hop', t: 1, cue: bad1 }];
  assert.ok(codes(s).includes('bad_cue'));
});

test('validate: stale beats and bad cues', () => {
  const s = narrated();
  beat(s, 1).start = must(beat(s, 1).start) + 1;
  assert.ok(codes(s).includes('narration_timing'));
  const t = narrated();
  t.motions = [{ object: 'n', move: 'hop', t: 1, cue: [5] }];
  assert.ok(codes(t).includes('bad_cue'));
});
}
tests2();

function tests3(): void {
test('facts: every fact needs a source, and a sentence names only facts that exist', () => {
  const s = newScene({});
  assert.equal(firstError(run(s, 'narrate', { sentences: [{ text: 'A fact.', facts: ['f1'] }] })).code, 'unknown_fact');
  assert.equal(firstError(run(s, 'add_fact', { id: 'f1', text: 'A fact.' })).code, 'bad_args');
  assert.ok(isOk(run(s, 'add_fact', { id: 'f1', text: 'A fact.', source: 'https://example.org' })));
  assert.ok(isOk(run(s, 'narrate', { sentences: [{ text: 'A fact.', facts: ['f1'] }] })));
  must(s.facts).push({ id: 'f2', text: 'A guess.', source: '' });
  assert.ok(codes(s).includes('fact_no_source'));
});

test('motions: schema, and no pop or out on a building, a structure or a vehicle', () => {
  const s = newScene({});
  run(s, 'place', { model: 'car-sedan', at: [0, 0], id: 'car' });
  run(s, 'place', { model: 'narrator', at: [5, 0], id: 'n' });
  assert.ok(isOk(run(s, 'add_motion', { id: 'car', move: 'hop', t: 1 })));
  assert.deepEqual(codes(s), []);
  assert.ok(isOk(run(s, 'add_motion', { id: 'car', move: 'pop', t: 1 })));
  assert.ok(codes(s).includes('object_vanishes'));
  motionsOf(s).pop();
  assert.equal(firstError(run(s, 'add_motion', { id: 'n', move: 'fly', t: 1 })).code, 'bad_args');
  assert.equal(firstError(run(s, 'add_motion', { id: 'n', move: 'pop' })).code, 'bad_args');
  motionsOf(s).push({ object: 'ghost', move: 'blink', t: 0 }, { object: 'n', move: 'out', t: 0, d: 0 });
  const c = codes(s);
  assert.ok(c.includes('unknown_object') && c.includes('schema'));
  assert.ok(errorsOf(run(newScene({}), 'remove', { id: 'x' })).length);
  run(s, 'remove', { id: 'car' });
  assert.ok(!motionsOf(s).some((m) => m.object === 'car'));
});

test('motion words: each gives finite numbers at every time; pop starts from nothing; hop goes up', () => {
  for (const move of MOVES) for (let t = 0; t <= 4; t += 1 / 60) {
    const p = poseAt([{ move, t: 1 }], t, 42);
    for (const [k, v] of Object.entries(p)) assert.ok(Number.isFinite(v), `${move} ${k} at ${t}`);
  }
  const at1 = (move: string, t: number, key: string): number => must(poseAt([{ move, t: 1 }], t)[key], key);
  assert.equal(at1('pop', 0.5, 's'), 0);
  assert.ok(Math.abs(at1('pop', 3, 's') - 1) < 1e-3);
  assert.ok(at1('hop', 1.25, 'up') > 0.4);
  assert.ok(at1('blink', 1.16, 'eye') < 0.2);
  assert.deepEqual(poseAt([{ move: 'wave', t: 1 }], 1.3), poseAt([{ move: 'wave', t: 1 }], 1.3));
});
}
tests3();

function tests4(): void {
test('raised and lowered text in labels', () => {
  assert.deepEqual(marks('31^{st} May'), [{ text: '31', shift: 0 }, { text: 'st', shift: 1 }, { text: ' May', shift: 0 }]);
  assert.deepEqual(marks('CO_{2}'), [{ text: 'CO', shift: 0 }, { text: '2', shift: -1 }]);
  assert.equal(plain('m^{2} and CO_{2}'), 'm² and CO₂');
  for (const t of ['Block_A', 'snake_case', 'x^2']) {
    assert.deepEqual(marks(t), [{ text: t, shift: 0 }]);
    assert.equal(plain(t), t);
  }
  assert.equal(plain('31^{st}'), '31st');
  assert.equal(plain('e^{i x}'), 'e^(i x)');
  const s = newScene({ duration: 10 });
  s.captions.push({ start: 0, end: 0.5, text: 'x^{2}' + 'a'.repeat(3) });
  assert.ok(!codes(s).includes('caption_too_short_on_screen'), 'the markup does not count as characters');
  assert.match(srt(s), /x²aaa/);
});

test('make_voice uses the voice files next to the scene', () => {
  const s = newScene({});
  run(s, 'narrate', { sentences: ['This is a zebra crossing.'] });
  assert.equal(firstError(run(s, 'make_voice', {})).code, 'no_voice');
  const r = run(s, 'make_voice', {}, { sceneDir: OUT });
  assert.ok(isOk(r), JSON.stringify(r));
  assert.equal(beat(s, 0).voice, voiceFile('This is a zebra crossing.'));
  assert.equal(must(okResult<{ beats: { voice: boolean }[] }>(r).beats[0]).voice, true);
  assert.deepEqual(codes(s), []);
});

test('an old scene file without narration, facts or motions stays valid', () => {
  const s = newScene({});
  run(s, 'place', { model: 'person', at: [0, 0] });
  assert.deepEqual(codes(s), []);
  assert.equal(s.narration, undefined);
});
}
tests4();
