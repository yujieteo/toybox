// The Goose port (engine/vid.goose) against the output of the vid.js code that it replaced.
// fixtures/vid-golden.json holds that output, recorded before the JavaScript was deleted
// (web/motion.js, web/marks.js and the times of core/narration.mjs at commit 7f37254).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MOVES, poseAt, seedOf, marks, plain, standIn, MAX_TEXT } from '../web/vid.js';
import { timeline, cueTime } from '../core/narration.mjs';

const G = JSON.parse(readFileSync(new URL('./fixtures/vid-golden.json', import.meta.url)));

test('vid port: the motion words, the seeds and the poses are the same as vid.js', () => {
  assert.deepEqual(MOVES, G.moves);
  for (const [id, seed] of G.seeds) assert.equal(seedOf(id), seed, id);
  const seeds = G.seeds.map(([id]) => seedOf(id));
  for (const [i, j, t, ...want] of G.pose) {
    const p = poseAt(i < 0 ? [] : G.motions[i], t, j < 0 ? null : seeds[j]);
    assert.deepEqual(Object.keys(p), G.keys);
    G.keys.forEach((k, n) => assert.ok(Math.abs(p[k] - want[n]) <= 1e-9 * Math.max(1, Math.abs(want[n])),
      `${JSON.stringify(G.motions[i] || [])} seed ${j} t ${t} ${k}: ${p[k]}, vid.js ${want[n]}`));
  }
});

test('vid port: marks and plain are the same as vid.js', () => {
  for (const m of G.marks) {
    assert.deepEqual(marks(m.t), m.marks, m.t);
    assert.equal(plain(m.t), m.plain, m.t);
  }
});

test('vid port: a long text gives correct marks up to the limit and an error after it', () => {
  const s = 'x^{2}'.repeat(MAX_TEXT / 5) + 'a'.repeat(MAX_TEXT % 5);
  assert.equal(marks(s).length, 2 * Math.floor(MAX_TEXT / 5) + 1);
  assert.equal(plain('a'.repeat(MAX_TEXT)).length, MAX_TEXT);
  assert.throws(() => plain('x^{2}'.repeat(60000)), RangeError);
  assert.throws(() => marks('a'.repeat(MAX_TEXT + 1)), RangeError);
  assert.equal(plain('m^{2}'), 'm²');
});

test('vid port: the beats, the cue times and the stand-in times are the same as vid.js', () => {
  for (const g of G.narration) {
    const n = g.sentences.map((x) => ({ ...x }));
    assert.equal(timeline(n), g.length);
    assert.deepEqual(n.map((x) => [x.start, x.end]), g.times);
    for (const c of g.cues) {
      if (c.error) assert.throws(() => cueTime(n, c.cue), { message: c.error });
      else assert.equal(cueTime(n, c.cue), c.t, JSON.stringify(c.cue));
    }
    assert.deepEqual(n.map((x) => standIn(x.text)), g.standIn);
  }
});
