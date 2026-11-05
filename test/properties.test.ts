import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { rotYaw, polyArea, rectCorners, overlapRatio } from '../core/geom.ts';
import { parseOverpass } from '../core/osm.ts';
import { parseScene, upgradeScene } from '../web/format.js';
import { plain, find } from '../web/vid.js';
import { valueAt } from '../core/scene.ts';
import type { Vec3 } from '../web/types.ts';

const finite = fc.double({ min: -1000, max: 1000, noNaN: true });
const vec3 = fc.tuple(finite, finite, finite);

function tests1(): void {
test('rotYaw keeps the length, and rotating back gives the input', () => {
  fc.assert(fc.property(vec3, fc.double({ min: -720, max: 720, noNaN: true }), (v: Vec3, yaw) => {
    const r = rotYaw(v, yaw);
    const back = rotYaw(r, -yaw);
    assert.ok(Math.abs(Math.hypot(...r) - Math.hypot(...v)) < 1e-6);
    for (let i = 0; i < 3; i++) assert.ok(Math.abs((back[i] ?? NaN) - (v[i] ?? NaN)) < 1e-6);
  }));
});

test('a rectangle has area w times d, and overlaps itself fully', () => {
  fc.assert(fc.property(finite, finite, fc.double({ min: 0.1, max: 50, noNaN: true }), fc.double({ min: 0.1, max: 50, noNaN: true }), fc.double({ min: 0, max: 360, noNaN: true }), (cx, cz, w, d, yaw) => {
    const c = rectCorners(cx, cz, w, d, yaw);
    assert.ok(Math.abs(Math.abs(polyArea(c)) - w * d) < 1e-6 * w * d + 1e-9);
    assert.ok(Math.abs(overlapRatio(c, c) - 1) < 1e-6);
  }));
});

test('upgradeScene is idempotent for a current scene, and parseScene rejects a non-scene', () => {
  fc.assert(fc.property(fc.string(), (title) => {
    const scene = parseScene({ toybox: 1, title, duration: 1, objects: [] });
    assert.deepEqual(upgradeScene(upgradeScene(scene)), upgradeScene(scene));
  }));
  fc.assert(fc.property(fc.oneof(fc.string(), fc.integer(), fc.constant(null), fc.array(fc.anything())), (junk) => {
    assert.throws(() => parseScene(junk));
  }));
});

test('parseOverpass never throws on an element list of any shape', () => {
  const element = fc.record({ type: fc.constantFrom('way', 'node', 'relation'), id: fc.integer(), tags: fc.option(fc.dictionary(fc.string(), fc.string()), { nil: undefined }) });
  fc.assert(fc.property(fc.array(element, { maxLength: 8 }), (elements) => {
    parseOverpass({ elements }, { lat: 1.3, lon: 103.8 });
  }));
});

test('plain gives the same text for a text without markers, and find stays inside the text', () => {
  fc.assert(fc.property(fc.stringMatching(/^[a-z0-9 ,.]{0,60}$/), (text) => {
    assert.equal(plain(text), text);
  }));
  fc.assert(fc.property(fc.stringMatching(/^[a-z ]{1,40}$/), fc.stringMatching(/^[a-z]{1,5}$/), (text, word) => {
    const k = find(text, word);
    assert.ok(k >= -1 && k < text.length);
  }));
});
}
tests1();

const vec = (x: number): Vec3 => [x, 0, 0];

function tests2(): void {
test('valueAt stays between the first and last key of a number track', () => {
  fc.assert(fc.property(fc.array(fc.double({ min: -100, max: 100, noNaN: true }), { minLength: 2, maxLength: 6 }), fc.double({ min: -5, max: 50, noNaN: true }), (values, t) => {
    const keys = values.map((v, i) => ({ t: i * 2, v: vec(v) }));
    const got = valueAt(keys, t);
    assert.ok(Array.isArray(got));
    const x = Number(got[0]);
    assert.ok(x >= Math.min(...values) - 1e-9 && x <= Math.max(...values) + 1e-9);
  }));
});
}
tests2();
