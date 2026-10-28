import test from 'node:test';
import assert from 'node:assert/strict';
import { FORMAT, upgradeScene } from '../web/format.js';
import { newScene } from '../core/scene.mjs';

test('a scene of the current format loads unchanged', () => {
  const s = newScene({});
  assert.equal(s.toybox, FORMAT);
  assert.equal(upgradeScene(s), s);
});

test('an older format goes through each upgrade in sequence', () => {
  const ups = { 1: (s) => ({ ...s, a: 1 }), 2: (s) => ({ ...s, b: s.a + 1 }) };
  assert.deepEqual(upgradeScene({ toybox: 1 }, ups, 3), { toybox: 3, a: 1, b: 2 });
  assert.deepEqual(upgradeScene({ toybox: 2, a: 5 }, ups, 3), { toybox: 3, a: 5, b: 6 });
});

test('a newer format or a file with no format fails with a clear message', () => {
  assert.throws(() => upgradeScene({ toybox: FORMAT + 1 }), /Use a newer Toybox/);
  assert.throws(() => upgradeScene({ title: 'x' }), /not a Toybox scene/);
  assert.throws(() => upgradeScene(null), /not a Toybox scene/);
});
