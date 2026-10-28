import test from 'node:test';
import assert from 'node:assert/strict';
import { commands as C, toolSpecs } from '../core/commands.mjs';
import { newScene, validate, objectBounds, loadCatalogue, valueAt, trackOf, project, cameraAt } from '../core/scene.mjs';

const fresh = () => newScene({});
const must = (r) => { assert.ok(r.ok, JSON.stringify(r)); return r.result; };

test('every tool has name, description and an object inputSchema', () => {
  const need = ['list_models', 'new_scene', 'get_scene', 'place', 'place_near', 'place_group', 'transform', 'duplicate', 'remove', 'build_room', 'build_stairs', 'place_sign',
    'set_pose', 'animate', 'move_along', 'set_camera', 'set_lighting', 'add_caption', 'add_callout', 'add_chapter', 'set_backdrop', 'set_cutaway', 'add_credit', 'validate', 'render_preview', 'export_scene'];
  for (const n of need) {
    const t = toolSpecs.find((x) => x.name === n); assert.ok(t, n);
    assert.ok(t.description.length > 10); assert.equal(t.inputSchema.type, 'object');
  }
});

test('list_models filters by query and kind', () => {
  const s = fresh();
  assert.ok(must(C.list_models(s, { query: 'bus' })).models.every((m) => /bus/.test(`${m.id} ${m.name} ${m.tags}`.toLowerCase())));
  assert.ok(must(C.list_models(s, { kind: 'vehicle' })).count >= 8);
  assert.ok(must(C.list_models(s, {})).models.some((m) => m.id === 'person'));
});

test('place validates and leaves the scene unchanged on error', () => {
  const s = fresh();
  must(C.place(s, { model: 'car-sedan', at: [0, 0], id: 'c1' }));
  const before = JSON.stringify(s);
  let r = C.place(s, { model: 'car-sedan', at: [0.5, 0] }); assert.equal(r.ok, false); assert.equal(r.errors[0].code, 'overlap');
  r = C.place(s, { model: 'nope', at: [9, 9] }); assert.equal(r.errors[0].code, 'unknown_model');
  r = C.place(s, { model: 'car-sedan', at: [9, -2, 9] }); assert.equal(r.errors[0].code, 'below_ground');
  r = C.place(s, { model: 'car-sedan' }); assert.equal(r.errors[0].code, 'bad_args');
  r = C.place(s, { model: 'car-sedan', at: [20, 0], source: 'estimated from a map' }); assert.equal(r.errors[0].code, 'estimate_not_flagged');
  assert.equal(JSON.stringify(s), before);
});

test('place_near, transform, duplicate, remove', () => {
  const s = fresh();
  must(C.place(s, { model: 'bus-private', at: [0, 0], id: 'bus' }));
  const n = must(C.place_near(s, { model: 'person', near: 'bus', offset: [4, 0] }));
  assert.deepEqual(s.objects.find((o) => o.id === n.id).at, [4, 0, 0]);
  must(C.transform(s, { id: 'bus', yaw: 90, at: [0, 10] }));
  assert.equal(s.objects[0].yaw, 90);
  const d = must(C.duplicate(s, { id: 'bus', count: 2, offset: [10, 0] }));
  assert.equal(d.ids.length, 2);
  must(C.set_pose(s, { id: n.id, t: 3, pose: 'wave' }));
  must(C.remove(s, { id: n.id }));
  assert.ok(!s.objects.some((o) => o.id === n.id)); assert.ok(!s.tracks.some((t) => t.object === n.id));
  assert.equal(C.remove(s, { id: 'zzz' }).ok, false);
});

test('place_group is deterministic by seed and respects patterns', () => {
  const run = (seed, pattern) => { const s = fresh(); must(C.place_group(s, { model: 'person', count: 12, pattern, at: [0, 0], seed, spacing: 1.5, variants: [1, 2, 3, 4, 5], poses: ['stand', 'wave', 'cheer'] })); return s.objects; };
  assert.deepEqual(run(7, 'scatter'), run(7, 'scatter'));
  assert.notDeepEqual(run(7, 'scatter'), run(8, 'scatter'));
  for (const p of ['line', 'grid', 'ring', 'scatter']) assert.equal(run(1, p).length, 12);
  assert.ok(run(7, 'scatter').every((o) => [1, 2, 3, 4, 5].includes(o.variant)));
  const ring = run(1, 'ring'); const r0 = Math.hypot(ring[0].at[0], ring[0].at[2]); assert.ok(ring.every((o) => Math.abs(Math.hypot(o.at[0], o.at[2]) - r0) < 0.01));
  const s = fresh(); const g = must(C.place_group(s, { model: 'cone', count: 5, pattern: 'line', at: [0, 0], spacing: 2 })); assert.equal(g.count, 5);
  const bad = C.place_group(s, { model: 'cone', count: 5, pattern: 'line', at: [0, 0], spacing: 0.1 }); assert.equal(bad.ok, false);
});

test('build_room makes tagged walls with the right yaw and door gaps', () => {
  const s = fresh();
  const r = must(C.build_room(s, { id: 'hall', at: [0, 0, 0], size: [10, 8, 3], doors: [{ wall: 's', at: 5 }], windows: [{ wall: 'n', at: 3, width: 1.2 }], source: 'estimated', estimated: true }));
  assert.ok(r.count > 8);
  const walls = s.objects.filter((o) => o.tags.includes('wall'));
  const yawOf = (k) => s.objects.find((o) => o.id.startsWith(`hall-${k}-wall`)).yaw;
  assert.deepEqual([yawOf('n'), yawOf('s'), yawOf('e'), yawOf('w')], [180, 0, 90, 270]);
  assert.ok(walls.length >= 8);
  assert.ok(s.objects.find((o) => o.id === 'hall-floor').tags.includes('floor'));
  assert.ok(s.objects.find((o) => o.id === 'hall-ceiling').tags.includes('ceiling'));
  assert.ok(s.objects.some((o) => o.model === 'door') && s.objects.some((o) => o.model === 'window'));
  // the south wall has a gap: no wall piece covers x = 0 at floor level
  const b = objectBounds(s, loadCatalogue());
  const south = s.objects.filter((o) => o.id.startsWith('hall-s-wall')).filter((o) => o.at[1] === 0 && o.scale[1] === 1);
  assert.ok(south.every((o) => b[o.id].max[0] < -0.4 || b[o.id].min[0] > 0.4));
  assert.equal(C.build_room(s, { id: 'bad', at: [50, 0, 0], size: [4, 4, 3], doors: [{ wall: 'n', at: 0.2 }] }).ok, false);
});

test('build_stairs returns a climbing path', () => {
  const s = fresh();
  const r = must(C.build_stairs(s, { id: 'st', from: [0, 0, 0], yaw: 0, source: 'estimated', estimated: true }));
  assert.ok(Math.abs(r.top[1] - 2.38) < 0.01); assert.ok(r.top[2] > 3.5);
  const o = s.objects[0]; assert.ok(Math.abs(o.at[2] - 1.96) < 0.01);
});

test('place_sign sets the label', () => {
  const s = fresh();
  const r = must(C.place_sign(s, { text: 'Race Course Road', at: [3, 3] }));
  assert.equal(s.objects.find((o) => o.id === r.id).label, 'Race Course Road');
  assert.equal(C.place_sign(s, { text: 'x'.repeat(80), at: [3, 3] }).ok, false);
});

test('move_along writes at, yaw and pose tracks', () => {
  const s = fresh();
  must(C.place(s, { model: 'person', at: [0, 0], id: 'w', variant: 4 }));
  must(C.move_along(s, { id: 'w', path: [[0, 0], [0, 7], [7, 7]], speed: 1.4, start: 2 }));
  const at = trackOf(s, 'w', 'at').keys, yaw = trackOf(s, 'w', 'yaw').keys, pose = trackOf(s, 'w', 'pose').keys;
  assert.equal(at.length, 3); assert.equal(at[0].t, 2); assert.ok(Math.abs(at[1].t - 7) < 0.01);
  assert.equal(yaw[0].v, 0);
  assert.ok(Math.abs(valueAt(yaw, 12) - 90) < 0.01, 'turns toward east on the second leg');
  assert.deepEqual(pose.map((k) => k.v), ['stand', 'walk', 'stand']);
  assert.deepEqual(valueAt(at, 4.5).map((v) => +v.toFixed(2)), [0, 0, 3.5]);
  must(C.move_along(s, { id: 'w', path: [[7, 7], [7, 0]], speed: 4, start: 20 }));
  assert.equal(trackOf(s, 'w', 'pose').keys.at(-2).v, 'run');
  assert.equal(C.move_along(s, { id: 'w', path: [[0, 0], [1, 1]], times: [5, 4] }).ok, false);
  assert.deepEqual(validate(s), []);
});

test('set_camera frame fits objects; cut and shot limits', () => {
  const s = fresh();
  must(C.place(s, { model: 'bus-public', at: [0, 0], id: 'b' }));
  must(C.place(s, { model: 'person', at: [10, 0], id: 'p' }));
  for (const shot of ['wide', 'medium', 'close', 'top', 'follow', 'orbit']) {
    const r = must(C.set_camera(s, { t: 0, shot, frame: ['b', 'p'] }));
    const cam = cameraAt(s, 0);
    for (const id of ['b', 'p']) {
      const bd = objectBounds(s, loadCatalogue())[id];
      for (const y of [bd.min[1], bd.max[1]]) for (const c of bd.corners) {
        const q = project(cam, [c[0], y, c[1]]); assert.ok(q && Math.abs(q.x) <= 1 && Math.abs(q.y) <= 1, `${shot} ${id}`);
      }
    }
    assert.equal(r.shot, shot);
  }
  must(C.set_camera(s, { t: 0, shot: 'wide', frame: ['b'] }));
  assert.equal(C.set_camera(s, { t: 5, shot: 'close', frame: ['p'] }).errors[0].code, 'shot_move_too_long');
  must(C.set_camera(s, { t: 1, shot: 'close', frame: ['p'] }));
  must(C.set_camera(s, { t: 9, shot: 'wide', frame: ['b'], cut: true }));
  assert.equal(s.camera.find((k) => k.t === 1).ease, 'step');
  must(C.set_camera(s, { t: 10, shot: 'top', eye: [0, 30, 1], target: [0, 0, 0] }) );
});

test('chapters, captions, callouts, lighting, credits, backdrop, cutaway', () => {
  const s = fresh();
  must(C.place(s, { model: 'car-taxi', at: [0, 0], id: 'taxi' }));
  must(C.set_camera(s, { t: 0, shot: 'wide', frame: ['taxi'] }));
  must(C.add_chapter(s, { start: 0, end: 10, title: 'One', clock: '21:21', caption: 'A taxi waits.', focus: ['taxi'], shot: 'wide', source: 'https://example.org' }));
  assert.equal(s.captions.length, 1); assert.equal(s.duration, 10);
  assert.equal(C.add_chapter(s, { start: 5, end: 12, title: 'Overlap', caption: 'x' }).ok, false);
  assert.equal(C.add_caption(s, { start: 11, end: 12, text: 'x'.repeat(100) }).errors[0].code, 'caption_too_short_on_screen');
  assert.equal(C.add_caption(s, { start: 11, end: 40, text: 'x'.repeat(300) }).errors[0].code, 'caption_too_long');
  must(C.add_callout(s, { start: 1, end: 4, text: 'Taxi', object: 'taxi', measured: true, source: 'x' }));
  assert.equal(C.add_callout(s, { start: 1, end: 4, text: 'Taxi', measured: true }).errors[0].code, 'measured_no_source');
  must(C.set_lighting(s, { t: 5, look: 'night' }));
  must(C.add_credit(s, { text: 'Credit' })); must(C.add_credit(s, { text: 'Credit' })); assert.equal(s.credits.length, 1);
  must(C.set_backdrop(s, { ground: 'street', origin: { lat: 1.3, lon: 103.8 }, estimated: true, source: 'estimated' }));
  assert.equal(s.map.origin.lat, 1.3);
  must(C.set_cutaway(s, {})); assert.equal(s.cutaway.ceilings, true);
  assert.deepEqual(validate(s), []);
  assert.equal(must(C.validate(s, {})).valid, true);
});

test('animate, render_preview stub, get_scene, export_scene', () => {
  const s = fresh();
  must(C.place(s, { model: 'person', at: [0, 0], id: 'p' }));
  must(C.animate(s, { id: 'p', channel: 'yaw', keys: [{ t: 0, v: 0 }, { t: 2, v: 90, ease: 'inout' }] }));
  assert.equal(C.animate(s, { id: 'p', channel: 'yaw', keys: [{ t: 2, v: 0 }, { t: 1, v: 90 }] }).errors[0].code, 'time_backwards');
  assert.equal(C.animate(s, { id: 'p', channel: 'pose', keys: [{ t: 0, v: 'fly' }] }).ok, false);
  assert.equal(must(C.render_preview(s, { t: 1 })).stub, true);
  assert.ok(must(C.get_scene(s, {})).objects.length === 1);
  assert.equal(must(C.get_scene(s, { full: true })).toybox, 1);
  assert.equal(must(C.export_scene(s, {})).scene.toybox, 1);
});
