import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { newScene, loadScene, saveScene, validate, contrast_ok, srt, objectBounds, loadCatalogue } from '../core/scene.mjs';

const obj = (o) => ({ id: 'a', model: 'car-sedan', at: [0, 0, 0], yaw: 0, scale: [1, 1, 1], ...o });
const codes = (s) => validate(s).map((e) => e.code);
const base = () => { const s = newScene({ duration: 100 }); return s; };

test('new scene is valid; save and load round trip', () => {
  const s = newScene({ title: 'x' });
  assert.deepEqual(validate(s), []);
  const p = join(mkdtempSync(join(tmpdir(), 'tb-')), 's.toybox.json');
  saveScene(p, s);
  assert.deepEqual(loadScene(p), s);
});

test('schema shape errors', () => {
  assert.ok(codes({ toybox: 2, objects: 'x' }).includes('schema'));
  const s = base(); s.objects.push(obj({ at: [1, 2] })); assert.ok(codes(s).includes('schema'));
  const t = base(); t.objects.push(obj({ pose: 'fly' })); assert.ok(codes(t).includes('schema'));
  const u = base(); u.objects.push({ id: 'p', model: 'person', variant: 30, at: [0, 0, 0] }); assert.ok(codes(u).includes('schema'));
});

test('unknown_model and below_ground', () => {
  const s = base(); s.objects.push(obj({ model: 'zzz' })); assert.ok(codes(s).includes('unknown_model'));
  const t = base(); t.objects.push(obj({ at: [0, -0.5, 0] })); assert.ok(codes(t).includes('below_ground'));
  const u = base(); u.objects.push(obj({ at: [0, -0.005, 0] })); assert.ok(!codes(u).includes('below_ground'));
});

test('overlap rules', () => {
  const s = base(); s.objects.push(obj({}), obj({ id: 'b', at: [0.5, 0, 0] })); assert.ok(codes(s).includes('overlap'));
  const apart = base(); apart.objects.push(obj({}), obj({ id: 'b', at: [5, 0, 0] })); assert.ok(!codes(apart).includes('overlap'));
  const ppl = base(); ppl.objects.push({ id: 'p1', model: 'person', at: [0, 0, 0] }, { id: 'p2', model: 'person', at: [0.1, 0, 0] }); assert.ok(!codes(ppl).includes('overlap'));
  const wall = base(); wall.objects.push(obj({ model: 'wall-3', tags: ['wall'] }), obj({ id: 'b', model: 'wall-3', tags: ['wall'] })); assert.ok(!codes(wall).includes('overlap'));
  const par = base(); par.objects.push(obj({}), obj({ id: 'b', parent: 'a' })); assert.ok(!codes(par).includes('overlap'));
  const mixed = base(); mixed.objects.push(obj({}), { id: 'p', model: 'person', at: [0, 0, 0] }); assert.ok(codes(mixed).includes('overlap'));
});

test('time_backwards', () => {
  const s = base(); s.objects.push(obj({}));
  s.tracks.push({ object: 'a', channel: 'yaw', keys: [{ t: 2, v: 0 }, { t: 1, v: 5 }] });
  assert.ok(codes(s).includes('time_backwards'));
  const c = base(); c.camera.push({ t: 3, shot: 'wide', eye: [0, 5, 10], target: [0, 0, 0] }, { t: 3, shot: 'wide', eye: [0, 5, 10], target: [0, 0, 0] });
  assert.ok(codes(c).includes('time_backwards'));
  const ch = base(); ch.chapters.push({ id: 'c', start: 5, end: 3, caption: 'x' }); assert.ok(codes(ch).includes('time_backwards'));
  const cp = base(); cp.captions.push({ start: 5, end: 3, text: 'x' }); assert.ok(codes(cp).includes('time_backwards'));
});

test('caption length and reading time', () => {
  const s = base(); s.captions.push({ start: 0, end: 60, text: 'a'.repeat(281) }); assert.ok(codes(s).includes('caption_too_long'));
  const t = base(); t.captions.push({ start: 0, end: 5, text: 'a'.repeat(100) }); assert.ok(codes(t).includes('caption_too_short_on_screen'));
  const u = base(); u.captions.push({ start: 0, end: 6, text: 'a'.repeat(100) }); assert.ok(!codes(u).includes('caption_too_short_on_screen'));
});

test('chapter_no_caption, sources and estimates', () => {
  const s = base(); s.chapters.push({ id: 'c', start: 0, end: 5, title: 't' }); assert.ok(codes(s).includes('chapter_no_caption'));
  s.captions.push({ start: 0, end: 5, text: 'hello' }); assert.ok(!codes(s).includes('chapter_no_caption'));
  const m = base(); m.objects.push(obj({ measured: true })); assert.ok(codes(m).includes('measured_no_source'));
  m.objects[0].source = 'url'; assert.ok(!codes(m).includes('measured_no_source'));
  const mc = base(); mc.chapters.push({ id: 'c', start: 0, end: 5, caption: 'x', measured: true }); assert.ok(codes(mc).includes('measured_no_source'));
  const e = base(); e.objects.push(obj({ source: 'estimated from photo' })); assert.ok(codes(e).includes('estimate_not_flagged'));
  e.objects[0].estimated = true; assert.ok(!codes(e).includes('estimate_not_flagged'));
});

test('focus_out_of_view uses the active camera key', () => {
  const s = base(); s.objects.push(obj({ at: [0, 0, 0] }), obj({ id: 'far', at: [100, 0, 0] }));
  s.camera.push({ t: 0, shot: 'wide', eye: [0, 5, 12], target: [0, 1, 0], fov: 50 });
  s.chapters.push({ id: 'c', start: 0, end: 5, caption: 'x', focus: ['a'] });
  assert.ok(!codes(s).includes('focus_out_of_view'));
  s.chapters[0].focus = ['far']; assert.ok(codes(s).includes('focus_out_of_view'));
  s.chapters[0].focus = ['a']; s.objects[0].hidden = true; assert.ok(codes(s).includes('focus_out_of_view'));
});

test('shot_move_too_long, too_few_shot_types, duration_too_short', () => {
  const s = base();
  s.camera.push({ t: 0, shot: 'wide', eye: [0, 5, 12], target: [0, 1, 0] }, { t: 1, shot: 'close', eye: [0, 2, 4], target: [0, 1, 0] });
  assert.ok(!codes(s).includes('shot_move_too_long'));
  s.camera[1].t = 2; assert.ok(codes(s).includes('shot_move_too_long'));
  s.camera[0].ease = 'step'; assert.ok(!codes(s).includes('shot_move_too_long'));
  const t = base();
  for (let i = 0; i < 12; i++) { t.chapters.push({ id: `c${i}`, start: i * 5, end: i * 5 + 5, caption: 'x', shot: 'wide' }); }
  assert.ok(codes(t).includes('too_few_shot_types'));
  t.chapters[1].shot = 'close'; t.chapters[2].shot = 'top'; assert.ok(!codes(t).includes('too_few_shot_types'));
  const d = newScene({ duration: 3 }); d.captions.push({ start: 0, end: 6, text: 'hello' }); assert.ok(codes(d).includes('duration_too_short'));
});

test('contrast_ok, srt, objectBounds', () => {
  assert.ok(contrast_ok('#000000', '#ffffff'));
  assert.ok(!contrast_ok('#777777', '#888888'));
  assert.ok(contrast_ok('#ffffff', '#3a3f47'));
  const s = base(); s.captions.push({ start: 1.5, end: 4, text: 'Hello' }, { start: 4.5, end: 3661.25, text: 'Bye' });
  assert.equal(srt(s), '1\n00:00:01,500 --> 00:00:04,000\nHello\n\n2\n00:00:04,500 --> 01:01:01,250\nBye\n');
  const o = base(); o.objects.push(obj({ at: [10, 1, 20], yaw: 90 }));
  const b = objectBounds(o, loadCatalogue()).a;
  assert.ok(Math.abs(b.max[0] - b.min[0] - 4.63) < 0.01, 'yaw 90 swaps the footprint');
  assert.equal(b.min[1], 1);
});
