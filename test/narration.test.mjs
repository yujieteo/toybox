import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { newScene, validate, srt } from '../core/scene.mjs';
import { runTool } from '../core/commands.mjs';
import { timeline, cueTime, LEAD, GAP, TAIL, STAND_IN } from '../core/narration.mjs';
import { voiceFile } from '../core/voice.mjs';
import { MOVES, poseAt } from '../web/motion.js';
import { marks, plain } from '../web/marks.js';

const OUT = fileURLToPath(new URL('../evals/out', import.meta.url));
const codes = (s) => validate(s).map((e) => e.code);
const run = (s, tool, args, ctx = {}) => runTool(s, tool, args, ctx);
function narrated(sentences = ['One two three.', ['Four five.', 1]]) {
  const s = newScene({});
  assert.ok(run(s, 'narrate', { sentences: sentences.map((x) => (Array.isArray(x) ? { text: x[0], pause: x[1] } : x)) }).ok);
  assert.ok(run(s, 'place', { model: 'narrator', at: [0, 0], id: 'n' }).ok);
  return s;
}

test('timeline: 1 sentence = 1 beat, with lead, gap, pause and tail', () => {
  const n = [{ text: 'a', seconds: 2 }, { text: 'b', seconds: 1, pause: 0.5 }];
  const length = timeline(n);
  assert.deepEqual([n[0].start, n[0].end], [LEAD, LEAD + 2]);
  assert.equal(n[1].start, LEAD + 2 + GAP);
  assert.equal(length, Math.round((n[1].end + 0.5 + TAIL) * 1000) / 1000);
  assert.equal(cueTime(n, [1]), n[1].start);
  assert.throws(() => cueTime(n, [2]), /does not exist/);
  assert.throws(() => cueTime(n, [0, 'zzz']), /is not in sentence/);
});

test('narrate: stand-in times, a caption for each sentence, and voice_missing until make_voice', () => {
  const s = narrated();
  assert.equal(s.narration[0].seconds, Math.round(STAND_IN * 'One two three.'.length * 1000) / 1000);
  assert.deepEqual(s.captions.map((c) => c.text), ['One two three.', 'Four five.']);
  assert.equal(s.captions[0].end, s.captions[1].start);
  assert.ok(s.duration >= s.captions[1].end);
  assert.deepEqual(codes(s), ['voice_missing']);
  assert.match(srt(s), /One two three\./);
  assert.equal(run(s, 'add_caption', { start: 0, end: 5, text: 'x' }).errors[0].code, 'narrated');
});

test('a cue follows the narration when the narration changes', () => {
  const s = narrated();
  const r = run(s, 'add_motion', { id: 'n', move: 'hop', cue: [1, 'five'] });
  assert.ok(r.ok, JSON.stringify(r));
  assert.equal(s.motions[0].t, cueTime(s.narration, [1, 'five']));
  assert.ok(run(s, 'narrate', { sentences: ['A much longer first sentence than before.', 'Four five.'] }).ok);
  assert.equal(s.motions[0].t, cueTime(s.narration, [1, 'five']));
  assert.ok(run(s, 'set_camera', { cue: [0, 'longer'], shot: 'wide', eye: [0, 5, 10], target: [0, 1, 0] }).ok);
  assert.equal(s.camera[0].t, cueTime(s.narration, [0, 'longer']));
  // a cue that names a word that the narration does not say fails, and the scene does not change
  const before = JSON.stringify(s);
  assert.equal(run(s, 'add_motion', { id: 'n', move: 'pop', cue: [0, 'banana'] }).errors[0].code, 'bad_cue');
  assert.equal(run(s, 'narrate', { sentences: ['Only this.'] }).errors[0].code, 'bad_cue');
  assert.equal(JSON.stringify(s), before);
});

test('validate: stale beats and bad cues', () => {
  const s = narrated();
  s.narration[1].start += 1;
  assert.ok(codes(s).includes('narration_timing'));
  const t = narrated();
  t.motions = [{ object: 'n', move: 'hop', t: 1, cue: [5] }];
  assert.ok(codes(t).includes('bad_cue'));
});

test('facts: every fact needs a source, and a sentence names only facts that exist', () => {
  const s = newScene({});
  assert.equal(run(s, 'narrate', { sentences: [{ text: 'A fact.', facts: ['f1'] }] }).errors[0].code, 'unknown_fact');
  assert.equal(run(s, 'add_fact', { id: 'f1', text: 'A fact.' }).errors[0].code, 'bad_args');
  assert.ok(run(s, 'add_fact', { id: 'f1', text: 'A fact.', source: 'https://example.org' }).ok);
  assert.ok(run(s, 'narrate', { sentences: [{ text: 'A fact.', facts: ['f1'] }] }).ok);
  s.facts.push({ id: 'f2', text: 'A guess.', source: '' });
  assert.ok(codes(s).includes('fact_no_source'));
});

test('motions: schema, and no pop or out on a building, a structure or a vehicle', () => {
  const s = newScene({});
  run(s, 'place', { model: 'car-sedan', at: [0, 0], id: 'car' });
  run(s, 'place', { model: 'narrator', at: [5, 0], id: 'n' });
  assert.ok(run(s, 'add_motion', { id: 'car', move: 'hop', t: 1 }).ok);
  assert.deepEqual(codes(s), []);
  assert.ok(run(s, 'add_motion', { id: 'car', move: 'pop', t: 1 }).ok);
  assert.ok(codes(s).includes('object_vanishes'));
  s.motions.pop();
  assert.equal(run(s, 'add_motion', { id: 'n', move: 'fly', t: 1 }).errors[0].code, 'bad_args');
  assert.equal(run(s, 'add_motion', { id: 'n', move: 'pop' }).errors[0].code, 'bad_args');
  s.motions.push({ object: 'ghost', move: 'blink', t: 0 }, { object: 'n', move: 'out', t: 0, d: 0 });
  const c = codes(s);
  assert.ok(c.includes('unknown_object') && c.includes('schema'));
  assert.ok(run(newScene({}), 'remove', { id: 'x' }).errors);
  run(s, 'remove', { id: 'car' });
  assert.ok(!s.motions.some((m) => m.object === 'car'));
});

test('motion words: each gives finite numbers at every time; pop starts from nothing; hop goes up', () => {
  for (const move of MOVES) for (let t = 0; t <= 4; t += 1 / 60) {
    const p = poseAt([{ move, t: 1 }], t, 42);
    for (const [k, v] of Object.entries(p)) assert.ok(Number.isFinite(v), `${move} ${k} at ${t}`);
  }
  assert.equal(poseAt([{ move: 'pop', t: 1 }], 0.5).s, 0);
  assert.ok(Math.abs(poseAt([{ move: 'pop', t: 1 }], 3).s - 1) < 1e-3);
  assert.ok(poseAt([{ move: 'hop', t: 1 }], 1.25).up > 0.4);
  assert.ok(poseAt([{ move: 'blink', t: 1 }], 1.16).eye < 0.2);
  assert.deepEqual(poseAt([{ move: 'wave', t: 1 }], 1.3), poseAt([{ move: 'wave', t: 1 }], 1.3));
});

test('raised and lowered text in labels', () => {
  assert.deepEqual(marks('31^{st} May'), [{ text: '31', shift: 0 }, { text: 'st', shift: 1 }, { text: ' May', shift: 0 }]);
  assert.deepEqual(marks('CO_2'), [{ text: 'CO', shift: 0 }, { text: '2', shift: -1 }]);
  assert.equal(plain('m^{2} and CO_2'), 'm² and CO₂');
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
  assert.equal(run(s, 'make_voice', {}).errors[0].code, 'no_voice');
  const r = run(s, 'make_voice', {}, { sceneDir: OUT });
  assert.ok(r.ok, JSON.stringify(r));
  assert.equal(s.narration[0].voice, voiceFile('This is a zebra crossing.'));
  assert.equal(r.result.beats[0].voice, true);
  assert.deepEqual(codes(s), []);
});

test('an old scene file without narration, facts or motions stays valid', () => {
  const s = newScene({});
  run(s, 'place', { model: 'person', at: [0, 0] });
  assert.deepEqual(codes(s), []);
  assert.equal(s.narration, undefined);
});
