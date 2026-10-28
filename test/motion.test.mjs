import test from 'node:test';
import assert from 'node:assert/strict';
import { commands as C } from '../core/commands.mjs';
import { newScene, validate, motionErrors, loadCatalogue } from '../core/scene.mjs';
import { signLabelShown } from '../web/viewer.js';

const must = (r) => { assert.ok(r.ok, JSON.stringify(r)); return r.result; };
const cat = loadCatalogue();
const codes = (errs) => errs.map((e) => e.code);
// A straight road along z, 8 s long.
function road() {
  const s = newScene({ ground: 'street', duration: 8 });
  for (const z of [-20, -10, 0, 10, 20]) must(C.place(s, { model: 'road-straight', at: [0, 0, z], id: `r${z}` }));
  return s;
}

test('two cars that drive through each other are a collision', () => {
  const s = road();
  must(C.place(s, { model: 'car-sedan', at: [-2.2, 0, 20], id: 'a', yaw: 180 }));
  must(C.place(s, { model: 'car-taxi', at: [-2.2, 0, -20], id: 'b' }));
  must(C.move_along(s, { id: 'a', path: [[-2.2, 20], [-2.2, -20]], times: [0, 4] }));
  const r = must(C.move_along(s, { id: 'b', path: [[-2.2, -20], [-2.2, 20]], times: [0, 4] }));
  assert.ok(r.collisions?.length, 'move_along reports the collision');
  const errs = motionErrors(s, cat);
  assert.ok(errs.some((e) => e.code === 'collision' && /a and b pass into each other/.test(e.message)), JSON.stringify(errs));
  assert.ok(must(C.validate(s, {})).errors.some((e) => e.code === 'collision'));
});

test('a car in the right-hand lane fails with left-hand traffic, and passes when drive is right', () => {
  const s = road();
  must(C.place(s, { model: 'car-sedan', at: [2.2, 0, 20], id: 'a', yaw: 180 }));
  must(C.move_along(s, { id: 'a', path: [[2.2, 20], [2.2, -20]], times: [0, 4] }));
  assert.deepEqual(codes(motionErrors(s, cat)), ['wrong_lane']);
  must(C.set_backdrop(s, { drive: 'right' }));
  assert.deepEqual(motionErrors(s, cat), []);
});

test('two people who walk into each other collide; people who keep apart pass', () => {
  const s = newScene({ duration: 6 });
  must(C.place(s, { model: 'person', at: [0, 0, -5], id: 'p', variant: 1 }));
  must(C.place(s, { model: 'person', at: [0, 0, 5], id: 'q', variant: 2 }));
  must(C.move_along(s, { id: 'p', path: [[0, -5], [0, 5]], times: [0, 5] }));
  must(C.move_along(s, { id: 'q', path: [[0, 5], [0, -5]], times: [0, 5] }));
  assert.deepEqual(codes(motionErrors(s, cat)), ['collision']);
  must(C.move_along(s, { id: 'q', path: [[0.6, 5], [0.6, -5]], times: [0, 5] }));
  assert.deepEqual(motionErrors(s, cat), []);
});

test('a person who floats above the ground is off_ground', () => {
  const s = newScene({ duration: 2 });
  must(C.place(s, { model: 'person', at: [0, 1, 0], id: 'p', variant: 1 }));
  assert.deepEqual(codes(motionErrors(s, cat)), ['off_ground']);
});

test('a hidden object and a building that shrinks to nothing fail validate', () => {
  const s = newScene({ duration: 4 });
  must(C.place(s, { model: 'shophouse-2', at: [0, 0, 8], id: 'house' }));
  s.objects[0].hidden = true;
  assert.ok(codes(validate(s, cat)).includes('object_hidden'));
  delete s.objects[0].hidden;
  must(C.animate(s, { id: 'house', channel: 'scale', keys: [{ t: 0, v: [1, 1, 1] }, { t: 2, v: [0.001, 0.001, 0.001], ease: 'step' }] }));
  assert.ok(codes(validate(s, cat)).includes('object_vanishes'));
});

test('a building that is tiny from the start fails validate', () => {
  const s = newScene({ duration: 4 });
  must(C.place(s, { model: 'shophouse-2', at: [0, 0, 8], id: 'house', scale: [0.001, 0.001, 0.001] }));
  assert.ok(codes(validate(s, cat)).includes('object_vanishes'));
  s.objects[0].scale = [1, 1, 1];
  assert.ok(!codes(validate(s, cat)).includes('object_vanishes'));
  must(C.animate(s, { id: 'house', channel: 'scale', keys: [{ t: 0, v: [0.001, 0.001, 0.001] }, { t: 4, v: [0.001, 0.001, 0.001] }] }));
  assert.ok(codes(validate(s, cat)).includes('object_vanishes'));
});

test('a pair that collides twice reports both time spans', () => {
  const s = newScene({ duration: 12 });
  must(C.place(s, { model: 'person', at: [0, 0, -5], id: 'p', variant: 1 }));
  must(C.place(s, { model: 'person', at: [0, 0, 0], id: 'q', variant: 2 }));
  must(C.move_along(s, { id: 'p', path: [[0, -5], [0, 5], [0, -5]], times: [0, 5, 10] }));
  const spans = motionErrors(s, cat).filter((e) => e.code === 'collision').map((e) => e.message.match(/from ([\d.]+) s/)[1]);
  assert.equal(spans.length, 2, JSON.stringify(spans));
  assert.ok(Number(spans[0]) < 5 && Number(spans[1]) > 5, JSON.stringify(spans));
});

test('a sign in a chapter focus shows only in that chapter; a sign in no focus shows in every chapter', () => {
  const s = newScene({ duration: 8 });
  s.objects.push({ id: 'coi', model: 'sign-board' }, { id: 'street', model: 'sign-board' });
  s.chapters = [{ start: 0, end: 4, focus: [] }, { start: 4, end: 8, focus: ['coi'] }];
  assert.equal(signLabelShown(s, 'coi', 1), false);
  assert.equal(signLabelShown(s, 'coi', 5), true);
  assert.equal(signLabelShown(s, 'street', 1), true);
  assert.equal(signLabelShown(s, 'street', 5), true);
  s.chapters = [];
  assert.equal(signLabelShown(s, 'coi', 1), true);
});

test('a vehicle may be swapped for its wreck at the same place and time', () => {
  const s = newScene({ duration: 4 });
  // the car drives to the place of the wreck, then the wreck takes its place
  must(C.place(s, { model: 'car-police', at: [0, 0, -10], id: 'car' }));
  must(C.place(s, { model: 'car-police-overturned', at: [0, 0, 0], id: 'wreck', scale: [0.001, 0.001, 0.001] }));
  must(C.move_along(s, { id: 'car', path: [[0, -10], [0, 0]], times: [0, 1.5] }));
  must(C.animate(s, { id: 'car', channel: 'scale', keys: [{ t: 0, v: [1, 1, 1], ease: 'step' }, { t: 2, v: [0.001, 0.001, 0.001], ease: 'step' }] }));
  must(C.animate(s, { id: 'wreck', channel: 'scale', keys: [{ t: 0, v: [0.001, 0.001, 0.001], ease: 'step' }, { t: 2, v: [1, 1, 1], ease: 'step' }] }));
  assert.ok(!codes(validate(s, cat)).includes('object_vanishes'));
  assert.deepEqual(motionErrors(s, cat), []);
});

test('a callout outside its chapter and an outdoor cutaway fail validate', () => {
  const s = newScene({ duration: 8 });
  must(C.place(s, { model: 'person', at: [0, 0], id: 'p', variant: 1 }));
  must(C.add_chapter(s, { start: 0, end: 4, title: 'One', caption: 'A person stands.', focus: ['p'], source: 'test' }));
  must(C.add_chapter(s, { start: 4, end: 8, title: 'Two', caption: 'The person stands.', focus: ['p'], source: 'test' }));
  must(C.add_callout(s, { start: 3, end: 6, text: 'here', object: 'p', source: 'test' }));
  assert.ok(codes(validate(s, cat)).includes('callout_outside_chapter'));
  must(C.place(s, { model: 'shophouse-2', at: [0, 0, 10], id: 'house', tags: ['wall'] }));
  must(C.set_cutaway(s, {}));
  assert.ok(codes(validate(s, cat)).includes('cutaway_outdoor'));
});

test('held gear is on the forearm or the wrist, and the guide list has motion', () => {
  const soc = cat.outfits.find((f) => f.id === 'soc-riot'), shield = cat.outfits.find((f) => f.id === 'police-shield');
  const bones = (f, prim, min) => f.parts.filter((p) => p.prim === prim && Math.max(...p.size) >= min).map((p) => p.bone);
  assert.deepEqual(bones(shield, 'cylinder', 0.5), ['lowerarm01.L']);
  assert.deepEqual(bones(soc, 'box', 1), ['lowerarm01.L']);
  assert.deepEqual(bones(soc, 'cylinder', 0.5), ['wrist.R']);
  const r = C.guide(newScene({}), { name: 'motion' });
  assert.ok(r.ok, JSON.stringify(r));
});
