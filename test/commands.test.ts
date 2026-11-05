import test from 'node:test';
import assert from 'node:assert/strict';
import { commands as C, toolSpecs } from '../core/commands.ts';
import { newScene, validate, objectBounds, loadCatalogue, valueAt, trackOf, project, cameraAt } from '../core/scene.ts';
import type { Scene, TrackValue, Channel } from '../web/types.ts';
import { must, okResult, firstError, isOk } from './helpers.ts';

type Vec = number[];
interface ModelRow { id: string; name: string; tags: string }
interface Placed { id: string }
interface Key { t: number; v: TrackValue }
interface Shot { shot: string }
interface RoomResult { count: number }
interface StairsResult { top: Vec }

const fresh = (): Scene => newScene({});
// The result of a successful command, as the type T.
const done = <T = Record<string, never>>(r: unknown, check?: (x: unknown) => x is T): T => okResult<T>(r, check);
// One component of a vector.
const comp = (v: readonly number[] | number | undefined, i: number): number => {
  if (typeof v === 'number') throw new Error('a number is not a vector');
  return must(must(v, 'vector')[i], `component ${i}`);
};
// The keys of a track.
const keysOf = (s: Scene, id: string, channel: Channel): Key[] => must(trackOf(s, id, channel), `${id} ${channel} track`).keys;

function tests1(): void {
test('every tool has name, description and an object inputSchema', () => {
  const need = ['list_models', 'new_scene', 'get_scene', 'place', 'place_near', 'place_group', 'transform', 'duplicate', 'remove', 'build_room', 'build_stairs', 'place_sign',
    'set_pose', 'animate', 'move_along', 'set_camera', 'set_lighting', 'add_caption', 'add_callout', 'add_chapter', 'set_backdrop', 'import_osm', 'set_cutaway', 'add_credit', 'validate', 'render_preview', 'export_scene'];
  for (const n of need) {
    const t = must(toolSpecs.find((x) => x.name === n), n);
    assert.ok(t.description.length > 10); assert.equal(t.inputSchema.type, 'object');
  }
});

test('list_models filters by query and kind', () => {
  const s = fresh();
  assert.ok(done<{ models: ModelRow[] }>(C.list_models(s, { query: 'bus' })).models.every((m) => `${m.id} ${m.name} ${m.tags}`.toLowerCase().includes('bus')));
  assert.ok(done<{ count: number }>(C.list_models(s, { kind: 'vehicle' })).count >= 8);
  assert.ok(done<{ models: ModelRow[] }>(C.list_models(s, {})).models.some((m) => m.id === 'person'));
});

test('place validates and leaves the scene unchanged on error', () => {
  const s = fresh();
  done(C.place(s, { model: 'car-sedan', at: [0, 0], id: 'c1' }));
  const before = JSON.stringify(s);
  let r = C.place(s, { model: 'car-sedan', at: [0.5, 0] }); assert.equal(isOk(r), false); assert.equal(firstError(r).code, 'overlap');
  r = C.place(s, { model: 'nope', at: [9, 9] }); assert.equal(firstError(r).code, 'unknown_model');
  r = C.place(s, { model: 'car-sedan', at: [9, -2, 9] }); assert.equal(firstError(r).code, 'below_ground');
  r = C.place(s, { model: 'car-sedan' }); assert.equal(firstError(r).code, 'bad_args');
  r = C.place(s, { model: 'car-sedan', at: [20, 0], source: 'estimated from a map' }); assert.equal(firstError(r).code, 'estimate_not_flagged');
  assert.equal(JSON.stringify(s), before);
});

test('place_near, transform, duplicate, remove', () => {
  const s = fresh();
  done(C.place(s, { model: 'bus-private', at: [0, 0], id: 'bus' }));
  const n = done<Placed>(C.place_near(s, { model: 'person', near: 'bus', offset: [4, 0] }));
  assert.deepEqual(must(s.objects.find((o) => o.id === n.id)).at, [4, 0, 0]);
  done(C.transform(s, { id: 'bus', yaw: 90, at: [0, 10] }));
  assert.equal(must(s.objects[0]).yaw, 90);
  const d = done<{ ids: string[] }>(C.duplicate(s, { id: 'bus', count: 2, offset: [10, 0] }));
  assert.equal(d.ids.length, 2);
  done(C.set_pose(s, { id: n.id, t: 3, pose: 'wave' }));
  done(C.remove(s, { id: n.id }));
  assert.ok(!s.objects.some((o) => o.id === n.id)); assert.ok(!s.tracks.some((t) => t.object === n.id));
  assert.equal(isOk(C.remove(s, { id: 'zzz' })), false);
});
}
tests1();

function tests2(): void {
test('place_group is deterministic by seed and respects patterns', () => {
  const run = (seed: number, pattern: string) => { const s = fresh(); done(C.place_group(s, { model: 'person', count: 12, pattern, at: [0, 0], seed, spacing: 1.5, variants: [1, 2, 3, 4, 5], poses: ['stand', 'wave', 'cheer'] })); return s.objects; };
  assert.deepEqual(run(7, 'scatter'), run(7, 'scatter'));
  assert.notDeepEqual(run(7, 'scatter'), run(8, 'scatter'));
  for (const p of ['line', 'grid', 'ring', 'scatter']) assert.equal(run(1, p).length, 12);
  assert.ok(run(7, 'scatter').every((o) => [1, 2, 3, 4, 5].includes(must(o.variant))));
  const ring = run(1, 'ring'); const first = must(ring[0]); const r0 = Math.hypot(comp(first.at, 0), comp(first.at, 2)); assert.ok(ring.every((o) => Math.abs(Math.hypot(comp(o.at, 0), comp(o.at, 2)) - r0) < 0.01));
  const s = fresh(); const g = done<{ count: number }>(C.place_group(s, { model: 'cone', count: 5, pattern: 'line', at: [0, 0], spacing: 2 })); assert.equal(g.count, 5);
  const bad = C.place_group(s, { model: 'cone', count: 5, pattern: 'line', at: [0, 0], spacing: 0.1 }); assert.equal(isOk(bad), false);
});

test('build_room makes tagged walls with the right yaw and door gaps', () => {
  const s = fresh();
  const r = done<RoomResult>(C.build_room(s, { id: 'hall', at: [0, 0, 0], size: [10, 8, 3], doors: [{ wall: 's', at: 5 }], windows: [{ wall: 'n', at: 3, width: 1.2 }], source: 'estimated', estimated: true }));
  assert.ok(r.count > 8);
  const walls = s.objects.filter((o) => o.tags?.includes('wall'));
  const yawOf = (k: string) => must(s.objects.find((o) => o.id.startsWith(`hall-${k}-wall`))).yaw;
  assert.deepEqual([yawOf('n'), yawOf('s'), yawOf('e'), yawOf('w')], [180, 0, 90, 270]);
  assert.ok(walls.length >= 8);
  assert.ok(must(must(s.objects.find((o) => o.id === 'hall-floor')).tags).includes('floor'));
  assert.ok(must(must(s.objects.find((o) => o.id === 'hall-ceiling')).tags).includes('ceiling'));
  assert.ok(s.objects.some((o) => o.model === 'door') && s.objects.some((o) => o.model === 'window'));
  // the south wall has a gap: no wall piece covers x = 0 at floor level
  const b = objectBounds(s, loadCatalogue());
  const south = s.objects.filter((o) => o.id.startsWith('hall-s-wall')).filter((o) => comp(o.at, 1) === 0 && comp(o.scale, 1) === 1);
  assert.ok(south.every((o) => comp(must(b[o.id]).max, 0) < -0.4 || comp(must(b[o.id]).min, 0) > 0.4));
  assert.equal(isOk(C.build_room(s, { id: 'bad', at: [50, 0, 0], size: [4, 4, 3], doors: [{ wall: 'n', at: 0.2 }] })), false);
});

test('build_stairs returns a climbing path', () => {
  const s = fresh();
  const r = done<StairsResult>(C.build_stairs(s, { id: 'st', from: [0, 0, 0], yaw: 0, source: 'estimated', estimated: true }));
  assert.ok(Math.abs(comp(r.top, 1) - 2.38) < 0.01); assert.ok(comp(r.top, 2) > 3.5);
  const o = must(s.objects[0]); assert.ok(Math.abs(comp(o.at, 2) - 1.96) < 0.01);
});

test('place_sign sets the label', () => {
  const s = fresh();
  const r = done<Placed>(C.place_sign(s, { text: 'Race Course Road', at: [3, 3] }));
  assert.equal(must(s.objects.find((o) => o.id === r.id)).label, 'Race Course Road');
  assert.equal(isOk(C.place_sign(s, { text: 'x'.repeat(80), at: [3, 3] })), false);
});
}
tests2();

function tests3(): void {
test('move_along writes at, yaw and pose tracks', () => {
  const s = fresh();
  done(C.place(s, { model: 'person', at: [0, 0], id: 'w', variant: 4 }));
  done(C.move_along(s, { id: 'w', path: [[0, 0], [0, 7], [7, 7]], speed: 1.4, start: 2 }));
  const at = keysOf(s, 'w', 'at'), yaw = keysOf(s, 'w', 'yaw'), pose = keysOf(s, 'w', 'pose');
  assert.equal(at.length, 3); assert.equal(must(at[0]).t, 2); assert.ok(Math.abs(must(at[1]).t - 7) < 0.01);
  assert.equal(must(yaw[0]).v, 0);
  assert.ok(Math.abs(Number(valueAt(yaw, 12)) - 90) < 0.01, 'turns toward east on the second leg');
  assert.deepEqual(pose.map((k) => k.v), ['stand', 'walk', 'stand']);
  const at45 = valueAt(at, 4.5);
  const mid: Vec = Array.isArray(at45) ? [...at45] : [];
  assert.deepEqual(mid.map((v) => +v.toFixed(2)), [0, 0, 3.5]);
  done(C.move_along(s, { id: 'w', path: [[7, 7], [7, 0]], speed: 4, start: 20 }));
  assert.equal(must(keysOf(s, 'w', 'pose').at(-2)).v, 'run');
  assert.equal(isOk(C.move_along(s, { id: 'w', path: [[0, 0], [1, 1]], times: [5, 4] })), false);
  assert.deepEqual(validate(s), []);
});

test('set_camera frame fits objects; cut and shot limits', () => {
  const s = fresh();
  done(C.place(s, { model: 'bus-public', at: [0, 0], id: 'b' }));
  done(C.place(s, { model: 'person', at: [10, 0], id: 'p' }));
  for (const shot of ['wide', 'medium', 'close', 'top', 'follow', 'orbit']) {
    const r = done<Shot>(C.set_camera(s, { t: 0, shot, frame: ['b', 'p'] }));
    const cam = must(cameraAt(s, 0), 'camera at 0');
    for (const id of ['b', 'p']) {
      const bd = must(objectBounds(s, loadCatalogue())[id], id);
      for (const y of [comp(bd.min, 1), comp(bd.max, 1)]) for (const c of bd.corners) {
        const q = project(cam, [comp(c, 0), y, comp(c, 1)]); assert.ok(q && Math.abs(q.x) <= 1 && Math.abs(q.y) <= 1, `${shot} ${id}`);
      }
    }
    assert.equal(r.shot, shot);
  }
  done(C.set_camera(s, { t: 0, shot: 'wide', frame: ['b'] }));
  assert.equal(firstError(C.set_camera(s, { t: 5, shot: 'close', frame: ['p'] })).code, 'shot_move_too_long');
  done(C.set_camera(s, { t: 1, shot: 'close', frame: ['p'] }));
  done(C.set_camera(s, { t: 9, shot: 'wide', frame: ['b'], cut: true }));
  assert.equal(must(s.camera.find((k) => k.t === 1)).ease, 'step');
  done(C.set_camera(s, { t: 10, shot: 'top', eye: [0, 30, 1], target: [0, 0, 0] }) );
});
}
tests3();

function tests4(): void {
test('chapters, captions, callouts, lighting, credits, backdrop, cutaway', () => {
  const s = fresh();
  done(C.place(s, { model: 'car-taxi', at: [0, 0], id: 'taxi' }));
  done(C.set_camera(s, { t: 0, shot: 'wide', frame: ['taxi'] }));
  done(C.add_chapter(s, { start: 0, end: 10, title: 'One', clock: '21:21', caption: 'A taxi waits.', focus: ['taxi'], shot: 'wide', source: 'https://example.org' }));
  assert.equal(s.captions.length, 1); assert.equal(s.duration, 10);
  assert.equal(isOk(C.add_chapter(s, { start: 5, end: 12, title: 'Overlap', caption: 'x' })), false);
  assert.equal(firstError(C.add_caption(s, { start: 11, end: 12, text: 'x'.repeat(100) })).code, 'caption_too_short_on_screen');
  assert.equal(firstError(C.add_caption(s, { start: 11, end: 40, text: 'x'.repeat(300) })).code, 'caption_too_long');
  done(C.add_callout(s, { start: 1, end: 4, text: 'Taxi', object: 'taxi', measured: true, source: 'x' }));
  assert.equal(firstError(C.add_callout(s, { start: 1, end: 4, text: 'Taxi', measured: true })).code, 'measured_no_source');
  done(C.set_lighting(s, { t: 5, look: 'night' }));
  done(C.add_credit(s, { text: 'Credit' })); done(C.add_credit(s, { text: 'Credit' })); assert.equal(s.credits.length, 1);
  done(C.set_backdrop(s, { ground: 'street', origin: { lat: 1.3, lon: 103.8 }, estimated: true, source: 'estimated' }));
  assert.equal(must(must(s.map).origin).lat, 1.3);
  done(C.set_cutaway(s, {})); assert.equal(must(s.cutaway).ceilings, true);
  assert.deepEqual(validate(s), []);
  assert.equal(done<{ valid: boolean }>(C.validate(s, {})).valid, true);
});

test('animate, render_preview stub, get_scene, export_scene', () => {
  const s = fresh();
  done(C.place(s, { model: 'person', at: [0, 0], id: 'p' }));
  done(C.animate(s, { id: 'p', channel: 'yaw', keys: [{ t: 0, v: 0 }, { t: 2, v: 90, ease: 'inout' }] }));
  assert.equal(firstError(C.animate(s, { id: 'p', channel: 'yaw', keys: [{ t: 2, v: 0 }, { t: 1, v: 90 }] })).code, 'time_backwards');
  assert.equal(isOk(C.animate(s, { id: 'p', channel: 'pose', keys: [{ t: 0, v: 'fly' }] })), false);
  assert.equal(done<{ stub: boolean }>(C.render_preview(s, { t: 1 })).stub, true);
  assert.ok(done<{ objects: unknown[] }>(C.get_scene(s, {})).objects.length === 1);
  assert.equal(done<{ toybox: number }>(C.get_scene(s, { full: true })).toybox, 1);
  assert.equal(done<{ scene: { toybox: number } }>(C.export_scene(s, {})).scene.toybox, 1);
});
}
tests4();
